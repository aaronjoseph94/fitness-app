// Owns: the photo of one of Aaron's own exercises (SPEC §7: "Aaron can add his own exercises (gym-specific machines)
// with a photo") — the bytes checked (JPEG/WebP of the declared type, no EXIF), stored in R2 at
// exercise-photos/<id>.(jpg|webp) with that key as the exercise's only image_paths entry — and, when exercises are
// read, each stored key turned into a signed /api/files URL (R2 is never reached any other way).
import { FileKey, type Exercise, type ExercisePhotoUploadQuery } from '@fitness/shared/schemas'
import { eq } from 'drizzle-orm'
import { exercises } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { HttpError, notFound } from '../../../lib/http-error'
import { signFileUrl } from '../../files'
import { checkPhotoBytes } from '../../photos'

/** Exercise lists are cached in the app for a while; a week-long link outlives any cached list. */
const PHOTO_URL_TTL_SECONDS = 7 * 86_400
const PREFIX = 'exercise-photos/'

/** POST /api/exercises/:id/photo: replace a custom exercise's image (404 unknown id, 409 not_custom, 422 bad bytes). */
export async function storeExercisePhoto(deps: Deps, id: string, query: ExercisePhotoUploadQuery, body: ArrayBuffer): Promise<string[]> {
  const [row] = await deps.db.select({ custom: exercises.custom, image_paths: exercises.image_paths }).from(exercises).where(eq(exercises.id, id))
  if (!row) throw notFound('Exercise')
  if (!row.custom) throw new HttpError(409, 'not_custom', 'Only your own exercises take a photo; library exercises keep their images')
  checkPhotoBytes(body, query.content_type)
  const key = FileKey.parse(`${PREFIX}${id}.${query.content_type === 'image/webp' ? 'webp' : 'jpg'}`)
  await deps.env.FILES.put(key, body, { httpMetadata: { contentType: query.content_type } })
  await deps.db.update(exercises).set({ image_paths: [key], updated_at: deps.now().toISOString() }).where(eq(exercises.id, id))
  // The other format's object, if the photo was replaced with a different type.
  const stale = row.image_paths.filter((p) => p.startsWith(PREFIX) && p !== key)
  if (stale.length) deps.waitUntil(deps.env.FILES.delete(stale))
  return [key]
}

/** Exercises with each stored photo key in image_paths replaced by a signed URL (static image paths unchanged). */
export async function withPhotoUrls<T extends Pick<Exercise, 'image_paths'>>(deps: Deps, items: T[]): Promise<T[]> {
  return Promise.all(
    items.map(async (item) => {
      if (!item.image_paths.some((p) => p.startsWith(PREFIX))) return item
      const image_paths = await Promise.all(
        item.image_paths.map(async (p) => {
          const key = p.startsWith(PREFIX) ? FileKey.safeParse(p) : null
          return key?.success ? (await signFileUrl(deps.env, key.data, PHOTO_URL_TTL_SECONDS, deps.now())).url : p
        }),
      )
      return { ...item, image_paths }
    }),
  )
}
