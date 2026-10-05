// Owns: meal photo uploads — the R2 object at meal-photos/<meal_id>/<photo_id>.(jpg|webp), its meal_photos row, and
// (for a photo meal not yet confirmed) sending the meal back to 'parsing' with one queued meal_analysis job that reads
// every photo when it runs. The browser has already downscaled the image and stripped EXIF (exif_stripped = true).
import type { FileKey, MealPhoto, MealPhotoUploadQuery } from '@fitness/shared/schemas'
import { and, eq, ne } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { meal_photos, meals } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { HttpError, notFound } from '../../../lib/http-error'
import { jobInsertOnce, runSoon } from '../../jobs'
import { runBatch, toPhoto } from './meals'

/** meal_analysis is user-facing: it runs before nightly work. */
export const MEAL_ANALYSIS_PRIORITY = 10

/** POST /api/meals/:id/photos. Replaying a photo id returns the stored photo (409 if it belongs to another meal). */
export async function addMealPhoto(deps: Deps, mealId: string, q: MealPhotoUploadQuery, body: ArrayBuffer): Promise<MealPhoto> {
  const { db } = deps
  const [[meal], [existing]] = await db.batch([
    db.select().from(meals).where(eq(meals.id, mealId)),
    db.select().from(meal_photos).where(eq(meal_photos.id, q.photo_id)),
  ])
  if (!meal) throw notFound('Meal')
  if (existing) {
    if (existing.meal_id !== mealId) throw new HttpError(409, 'photo_conflict', 'That photo id belongs to another meal')
    return toPhoto(deps, existing)
  }

  const key = `meal-photos/${mealId}/${q.photo_id}.${q.content_type === 'image/webp' ? 'webp' : 'jpg'}` as FileKey
  await deps.env.FILES.put(key, body, { httpMetadata: { contentType: q.content_type } })

  const now = deps.now().toISOString()
  const statements: BatchItem<'sqlite'>[] = [
    db
      .insert(meal_photos)
      .values({
        id: q.photo_id,
        meal_id: mealId,
        storage_path: key,
        width: q.width > 0 ? q.width : null,
        height: q.height > 0 ? q.height : null,
        exif_stripped: true,
        created_at: now,
        updated_at: now,
      })
      .onConflictDoNothing({ target: meal_photos.id }),
  ]
  const analyse = meal.input_method === 'photo' && meal.status !== 'confirmed'
  const job = analyse
    ? await jobInsertOnce(deps, { type: 'meal_analysis', payload: { meal_id: mealId }, priority: MEAL_ANALYSIS_PRIORITY }, { meal_id: mealId })
    : null
  if (analyse)
    statements.push(
      db
        .update(meals)
        .set({ status: 'parsing', updated_at: now })
        .where(and(eq(meals.id, mealId), ne(meals.status, 'confirmed'))),
    )
  if (job) statements.push(job.statement)
  await runBatch(deps, statements)
  if (job) runSoon(deps, job.id)

  const [row] = await db.select().from(meal_photos).where(eq(meal_photos.id, q.photo_id))
  return toPhoto(deps, row!)
}
