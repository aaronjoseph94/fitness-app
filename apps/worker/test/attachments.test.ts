// Owns: tests at the attachments seam — a screenshot upload stored once (a replay returns the same row), metadata-
// carrying bytes refused, a message claiming its screenshots and getting their bytes back, another message getting
// none, and a forgotten thread's screenshots removed.
import { ChatAttachmentUploadQuery } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'
import { chat_attachments, createDb } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { attachmentImages, deleteThreadAttachments, uploadAttachment } from '../src/modules/attachments'
import { eq } from 'drizzle-orm'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
const deps: Deps = {
  db,
  env,
  now: () => new Date('2026-10-29T18:00:00.000Z'),
  actor: 'user',
  waitUntil: (p) => void pending.push(p.catch(() => undefined)),
}

afterEach(async () => {
  await Promise.all(pending.splice(0))
})

/** A minimal canvas-style JPEG header: SOI, APP0 "JFIF", then EOI. */
const JFIF = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01,
  0x00, 0x00, 0xff, 0xd9,
])
/** The same file as a phone camera writes it: an APP1 "Exif" segment straight after SOI. */
const WITH_EXIF = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xff, 0xd9,
])

const query = (attachment_id: string) =>
  ChatAttachmentUploadQuery.parse({ attachment_id, content_type: 'image/jpeg' })

describe('chat screenshots', () => {
  it('stores an upload once: a replay returns the same row', async () => {
    const id = crypto.randomUUID()
    const first = await uploadAttachment(deps, query(id), JFIF.slice().buffer)
    expect(first).toEqual({ id, content_type: 'image/jpeg', created_at: '2026-10-29T18:00:00.000Z' })
    const replay = await uploadAttachment(deps, query(id), JFIF.slice().buffer)
    expect(replay).toEqual(first)
    const rows = await db.select().from(chat_attachments).where(eq(chat_attachments.id, id))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ message_id: null, r2_key: `chat/${id}.jpg`, bytes: JFIF.byteLength })
  })

  it('refuses a JPEG that still carries an EXIF segment (422)', async () => {
    const id = crypto.randomUUID()
    await expect(uploadAttachment(deps, query(id), WITH_EXIF.slice().buffer)).rejects.toMatchObject({
      status: 422,
      code: 'exif_present',
    })
    expect(await db.select().from(chat_attachments).where(eq(chat_attachments.id, id))).toHaveLength(0)
  })

  it('a message claims its screenshots and gets their bytes; another message cannot; a forgotten thread drops them', async () => {
    const id = crypto.randomUUID()
    const message = crypto.randomUUID()
    await uploadAttachment(deps, query(id), JFIF.slice().buffer)

    const images = await attachmentImages(deps, { ids: [id, crypto.randomUUID()], message_id: message })
    expect(images).toHaveLength(1)
    expect(images[0]!.mime).toBe('image/jpeg')
    expect(new Uint8Array(images[0]!.data as ArrayBuffer)).toEqual(JFIF)
    // Replaying the same turn reads them again.
    expect(await attachmentImages(deps, { ids: [id], message_id: message })).toHaveLength(1)
    expect(await attachmentImages(deps, { ids: [id], message_id: crypto.randomUUID() })).toEqual([])

    expect(await deleteThreadAttachments(deps, [message])).toBe(1)
    await Promise.all(pending.splice(0))
    expect(await db.select().from(chat_attachments).where(eq(chat_attachments.id, id))).toHaveLength(0)
    expect(await env.FILES.get(`chat/${id}.jpg`)).toBeNull()
  })
})
