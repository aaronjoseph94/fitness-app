// Owns: the chat_attachments rows and their R2 objects at chat/<id>.(jpg|webp) — upload (checked, idempotent by id),
// claiming screenshots for one message and reading their bytes back for the model, deleting a thread's screenshots,
// and the sweep that drops stale ones. Screenshots are transient: they are not exported or backed up.
import type { ChatAttachment, ChatAttachmentUploadQuery, ImageType } from '@fitness/shared/schemas'
import { MAX_SCREENSHOTS } from '@fitness/shared/schemas'
import { and, eq, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm'
import { chat_attachments, chunk, runBatch, type Row } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { HttpError } from '../../../lib/http-error'
import type { ImageInput } from '../../llm'
import { checkPhotoBytes } from '../../photos'

/** A re-encoded screenshot (≤ ~1,600 px JPEG/WebP) is a few hundred KB; 2 MB leaves room and keeps the vision call small. */
export const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024
/** An upload no message claimed within a day was abandoned (draft discarded, send failed for good). */
export const UNCLAIMED_TTL_MS = 24 * 3_600_000
/** A claimed screenshot stays 30 days, so a replayed or retried turn can still read it; the thread keeps only text. */
export const CLAIMED_TTL_MS = 30 * 24 * 3_600_000
/** Rows one sweep tick removes at most (one select, one batch, one R2 bulk delete). */
const SWEEP_LIMIT = 50
/** ids in one IN (…) list: under the 100 bound-parameter cap with room for the other conditions. */
const IN_CHUNK = 90

const log = (msg: string, extra: Record<string, unknown>) =>
  console.warn(JSON.stringify({ level: 'warn', msg, ...extra }))

const keyFor = (id: string, type: ImageType) => `chat/${id}.${type === 'image/webp' ? 'webp' : 'jpg'}`

const toAttachment = (r: Row<typeof chat_attachments>): ChatAttachment => ({
  id: r.id,
  content_type: r.content_type as ImageType,
  created_at: r.created_at,
})

/** POST /api/ai/attachments. A replayed id returns the stored row without re-checking or re-storing its bytes. */
export async function uploadAttachment(
  deps: Deps,
  q: ChatAttachmentUploadQuery,
  bytes: ArrayBuffer,
): Promise<ChatAttachment> {
  const { db } = deps
  const [existing] = await db.select().from(chat_attachments).where(eq(chat_attachments.id, q.attachment_id))
  if (existing) return toAttachment(existing)

  if (bytes.byteLength > MAX_SCREENSHOT_BYTES)
    throw new HttpError(
      422,
      'image_too_large',
      `A screenshot may be at most ${MAX_SCREENSHOT_BYTES / 1024 / 1024} MB`,
    )
  checkPhotoBytes(bytes, q.content_type) // it goes to a vision LLM: the declared type, and no EXIF / XMP
  const key = keyFor(q.attachment_id, q.content_type)
  await deps.env.FILES.put(key, bytes, { httpMetadata: { contentType: q.content_type } })

  const now = deps.now().toISOString()
  const [, [row]] = await db.batch([
    db
      .insert(chat_attachments)
      .values({
        id: q.attachment_id,
        message_id: null,
        r2_key: key,
        content_type: q.content_type,
        bytes: bytes.byteLength,
        created_at: now,
        updated_at: now,
      })
      .onConflictDoNothing({ target: chat_attachments.id }),
    db.select().from(chat_attachments).where(eq(chat_attachments.id, q.attachment_id)),
  ])
  return toAttachment(row!)
}

/**
 * Claim up to MAX_SCREENSHOTS screenshots for `message_id` and read their bytes for the model, in the order given.
 * One UPDATE … WHERE message_id IS NULL OR message_id = ? RETURNING claims them, so a replayed turn gets its own back
 * and another message gets none. Unknown, foreign-claimed or missing-in-R2 ids are skipped with a warning.
 */
export async function attachmentImages(
  deps: Deps,
  input: { ids: readonly string[]; message_id: string },
): Promise<ImageInput[]> {
  const ids = [...new Set(input.ids)].slice(0, MAX_SCREENSHOTS)
  if (ids.length === 0) return []
  const claimed = await deps.db
    .update(chat_attachments)
    .set({ message_id: input.message_id, updated_at: deps.now().toISOString() })
    .where(
      and(
        inArray(chat_attachments.id, ids),
        or(isNull(chat_attachments.message_id), eq(chat_attachments.message_id, input.message_id)),
      ),
    )
    .returning()
  const byId = new Map(claimed.map((r) => [r.id, r]))
  const skipped = ids.filter((id) => !byId.has(id))
  if (skipped.length) log('screenshots skipped: unknown or claimed by another message', { ids: skipped })

  const images = await Promise.all(
    ids.map(async (id): Promise<ImageInput | null> => {
      const row = byId.get(id)
      if (!row) return null
      const object = await deps.env.FILES.get(row.r2_key)
      if (!object) {
        log('screenshot missing in R2; skipped', { id })
        return null
      }
      return { mime: row.content_type, data: await object.arrayBuffer() }
    }),
  )
  return images.filter((i): i is ImageInput => i !== null)
}

/** Delete rows (one batch) and then their R2 objects (after the response). Returns how many rows went. */
async function removeRows(deps: Deps, rows: { id: string; r2_key: string }[]): Promise<number> {
  if (rows.length === 0) return 0
  const { db } = deps
  await runBatch(
    db,
    chunk(
      rows.map((r) => r.id),
      IN_CHUNK,
    ).map((ids) => db.delete(chat_attachments).where(inArray(chat_attachments.id, ids))),
  )
  const keys = rows.map((r) => r.r2_key)
  deps.waitUntil(
    Promise.all(chunk(keys, 1000).map((k) => deps.env.FILES.delete(k))).catch((e: unknown) =>
      log('screenshot R2 delete failed', { error: String(e) }),
    ),
  )
  return rows.length
}

/** A thread is forgotten: every screenshot its messages claimed goes (rows now, R2 objects after the response). */
export async function deleteThreadAttachments(deps: Deps, messageIds: readonly string[]): Promise<number> {
  if (messageIds.length === 0) return 0
  const { db } = deps
  const selects = chunk([...new Set(messageIds)], IN_CHUNK).map((ids) =>
    db
      .select({ id: chat_attachments.id, r2_key: chat_attachments.r2_key })
      .from(chat_attachments)
      .where(inArray(chat_attachments.message_id, ids)),
  )
  const [first, ...rest] = selects
  const found = await db.batch([first!, ...rest])
  return removeRows(deps, found.flat())
}

/**
 * Sweep step 'chat_attachments_expire': unclaimed screenshots older than 24 h and claimed ones older than 30 days, up to
 * SWEEP_LIMIT per tick (one select and one delete batch; a backlog drains over the next ticks).
 */
export async function expireAttachments(deps: Deps): Promise<number> {
  const now = deps.now().getTime()
  const unclaimedBefore = new Date(now - UNCLAIMED_TTL_MS).toISOString()
  const claimedBefore = new Date(now - CLAIMED_TTL_MS).toISOString()
  const rows = await deps.db
    .select({ id: chat_attachments.id, r2_key: chat_attachments.r2_key })
    .from(chat_attachments)
    .where(
      or(
        and(isNull(chat_attachments.message_id), lt(chat_attachments.created_at, unclaimedBefore)),
        and(isNotNull(chat_attachments.message_id), lt(chat_attachments.created_at, claimedBefore)),
      ),
    )
    .limit(SWEEP_LIMIT)
  return removeRows(deps, rows)
}
