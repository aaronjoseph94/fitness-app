// Owns: the photos module's interface — progress photos (front/side/back, SPEC §8) stored privately in R2 under
// progress-photos/<id>.<ext> with their pixel size, each tagged with that day's trend weight and the nearest confirmed scan.
//   uploadPhoto(deps, upload)  → ProgressPhoto    idempotent by the client id (a replay returns the stored photo)
//   listPhotos(deps, query)    → ProgressPhoto[]  newest first, short-lived signed URLs, tags read live
//   removePhoto(deps, id)      → Ok               row now, R2 object after the response; replaying is a no-op
//   checkPhotoBytes(bytes, type)                   422 unless JPEG/WebP/PNG bytes of that type without EXIF, XMP or
//                                                  text metadata (meal photos, scan sheets and exercise photos reuse
//                                                  it before anything can be stored or reach a vision LLM)
//
// PRIVACY RAIL: progress photos are never sent to any LLM. This module must not import the llm module (or jobs, which
// hand payloads to it), and no job payload, tool output or prompt may carry a photo, its URL or its key.
// test/photos.test.ts checks it by behaviour (no outbound call and no job across upload, list, view and remove).
import type { Ok, PhotoListQuery, PhotoUploadQuery, ProgressPhoto } from '@fitness/shared/schemas'
import { localDate } from '@fitness/shared/engine'
import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm'
import { progress_photos } from '../../db'
import type { Deps } from '../../lib/deps'
import { checkPhotoBytes } from './lib/image'
import { loadTags, nearestScan, photoKey, toPhoto } from './lib/tags'

export { PHOTO_URL_TTL_SECONDS } from './lib/tags'
export { checkPhotoBytes, type CheckedImageType } from './lib/image'

/** POST /api/photos: the query's metadata plus the image bytes (already downscaled and re-encoded by the browser). */
export type PhotoUpload = PhotoUploadQuery & { image: ArrayBuffer }

/**
 * Store a progress photo: check the bytes (declared type, no EXIF; 422 otherwise), put them in R2, and insert the row
 * tagged with the trend weight of taken_at's Edmonton date and the nearest confirmed scan at upload time.
 */
export async function uploadPhoto(deps: Deps, input: PhotoUpload): Promise<ProgressPhoto> {
  const { db } = deps
  const [existing] = await db.select().from(progress_photos).where(eq(progress_photos.id, input.id))
  if (existing) return toPhoto(deps, existing, await loadTags(deps, [existing.date]))

  checkPhotoBytes(input.image, input.content_type)
  const date = localDate(input.taken_at)
  const key = photoKey(input.id, input.content_type)
  const [tags] = await Promise.all([
    loadTags(deps, [date]),
    deps.env.FILES.put(key, input.image, {
      httpMetadata: { contentType: input.content_type },
      customMetadata: { pose: input.pose, taken_at: input.taken_at, width: String(input.width), height: String(input.height) },
    }),
  ])
  const [, [row]] = await db.batch([
    db
      .insert(progress_photos)
      .values({
        id: input.id,
        taken_at: input.taken_at,
        date,
        pose: input.pose,
        storage_path: key,
        width: input.width,
        height: input.height,
        weight_kg: tags.trendKg.get(date) ?? null,
        nearest_scan_id: nearestScan(tags, input.taken_at)?.id ?? null,
        note: input.note || null,
      })
      .onConflictDoNothing(),
    db.select().from(progress_photos).where(eq(progress_photos.id, input.id)),
  ])
  return toPhoto(deps, row!, tags)
}

/** GET /api/photos: photos newest first (taken_at), optionally one pose and an inclusive range of local dates. */
export async function listPhotos(deps: Deps, query: PhotoListQuery): Promise<ProgressPhoto[]> {
  const where: SQL[] = []
  if (query.pose) where.push(eq(progress_photos.pose, query.pose))
  if (query.from) where.push(gte(progress_photos.date, query.from))
  if (query.to) where.push(lte(progress_photos.date, query.to))
  const rows = await deps.db
    .select()
    .from(progress_photos)
    .where(and(...where))
    .orderBy(desc(progress_photos.taken_at), desc(progress_photos.created_at))
  const tags = await loadTags(
    deps,
    rows.map((r) => r.date),
  )
  return Promise.all(rows.map((r) => toPhoto(deps, r, tags)))
}

/** DELETE /api/photos/:id: drop the row; the R2 object goes after the response. An unknown id is already gone. */
export async function removePhoto(deps: Deps, id: string): Promise<Ok> {
  const [row] = await deps.db.select({ key: progress_photos.storage_path }).from(progress_photos).where(eq(progress_photos.id, id))
  if (!row) return { ok: true }
  await deps.db.delete(progress_photos).where(eq(progress_photos.id, id))
  deps.waitUntil(deps.env.FILES.delete(row.key).catch(() => undefined))
  return { ok: true }
}
