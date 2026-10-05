// Owns: nutrition — meals (each with items, computed totals and photos), foods and favourites (incl. recipes).
// Interface:
//   listMeals(deps, date) / getMeal(deps, id)   → Meal[] / Meal
//   createMeal(deps, MealCreate)  → Meal   by input method: manual/barcode items (food items priced per 100 g) and a
//        favourite (copied, scaled) are confirmed at once; text/voice store raw_text as 'parsing' and queue a
//        meal_analysis job in the same batch; photo waits as 'parsing' for its photos. A replayed id returns the meal.
//   updateMeal(deps, id, MealPatch) → Meal  slot / eaten_at (date recomputed) / items (replace all) / confirm
//   deleteMeal(deps, id)          → Ok     items, photos and the meal in one batch; R2 objects removed after
//   searchFoods(deps, { q?, barcode? }) → Food[]   barcode (cache, then Open Food Facts) and text (cache, then OFF/USDA)
//   createFood(deps, FoodCreate)  → Food   source 'user'; idempotent by id
//   listFavourites / createFavourite / updateFavourite → Favourite(s) with the nutrition of one default portion
import { localDate } from '@fitness/shared/engine'
import type { Food, FoodCreate, FoodSearchQuery, Meal, MealCreate, MealItemInput, MealPatch, Ok } from '@fitness/shared/schemas'
import { eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { meal_items, meal_photos, meals } from '../../db'
import type { Deps } from '../../lib/deps'
import { notFound } from '../../lib/http-error'
import { createFoodSources } from '../food-sources'
import { jobInsert, runSoon } from '../jobs'
import { favouriteItemInputs } from './lib/favourites'
import { createUserFood, toFood } from './lib/foods'
import { itemInserts, itemRows, mealById, mealsOn, runBatch } from './lib/meals'

export { createFavourite, listFavourites, updateFavourite } from './lib/favourites'

/** Most foods a search returns. */
const SEARCH_LIMIT = 20
/** meal_analysis is user-facing: it runs before nightly work. */
const MEAL_ANALYSIS_PRIORITY = 10

export function listMeals(deps: Deps, date: string): Promise<Meal[]> {
  return mealsOn(deps, date)
}

export async function getMeal(deps: Deps, id: string): Promise<Meal> {
  const meal = await mealById(deps, id)
  if (!meal) throw notFound('Meal')
  return meal
}

export async function createMeal(deps: Deps, body: MealCreate): Promise<Meal> {
  const existing = await mealById(deps, body.id)
  if (existing) return existing

  const now = deps.now().toISOString()
  let status: Meal['status'] = 'confirmed'
  let raw_text: string | null = null
  let inputs: MealItemInput[] = []
  let job: { id: string; statement: BatchItem<'sqlite'> } | null = null
  switch (body.input_method) {
    case 'text':
    case 'voice':
      status = 'parsing'
      raw_text = body.raw_text
      job = jobInsert(deps, { type: 'meal_analysis', payload: { meal_id: body.id }, priority: MEAL_ANALYSIS_PRIORITY })
      break
    case 'photo':
      status = 'parsing'
      raw_text = body.raw_text ?? null
      break
    case 'manual':
    case 'barcode':
      inputs = body.items
      break
    case 'favorite':
      inputs = await favouriteItemInputs(deps, body.favorite_id, body.scale)
      break
  }
  const items = await itemRows(deps, body.id, inputs)
  const statements: BatchItem<'sqlite'>[] = [
    deps.db.insert(meals).values({
      id: body.id,
      date: localDate(body.eaten_at),
      slot: body.slot,
      eaten_at: body.eaten_at,
      input_method: body.input_method,
      raw_text,
      status,
      actor: deps.actor,
      created_at: now,
      updated_at: now,
    }),
    ...itemInserts(deps, items),
    ...(job ? [job.statement] : []),
  ]
  try {
    await runBatch(deps, statements)
  } catch (e) {
    const raced = await mealById(deps, body.id) // a concurrent replay of the same id won
    if (raced) return raced
    throw e
  }
  if (job) runSoon(deps, job.id)
  return getMeal(deps, body.id)
}

/** Items replace the whole list (a 'parsing' meal moves to 'review'); confirm: true confirms it. */
export async function updateMeal(deps: Deps, id: string, patch: MealPatch): Promise<Meal> {
  const [meal] = await deps.db.select().from(meals).where(eq(meals.id, id))
  if (!meal) throw notFound('Meal')
  const now = deps.now().toISOString()
  let status = meal.status
  const statements: BatchItem<'sqlite'>[] = []
  if (patch.items !== undefined) {
    statements.push(deps.db.delete(meal_items).where(eq(meal_items.meal_id, id)), ...itemInserts(deps, await itemRows(deps, id, patch.items)))
    if (status === 'parsing') status = 'review'
  }
  if (patch.confirm) status = 'confirmed'
  await runBatch(deps, [
    deps.db
      .update(meals)
      .set({
        slot: patch.slot ?? meal.slot,
        ...(patch.eaten_at ? { eaten_at: patch.eaten_at, date: localDate(patch.eaten_at) } : {}),
        status,
        updated_at: now,
      })
      .where(eq(meals.id, id)),
    ...statements,
  ])
  return getMeal(deps, id)
}

/** Delete a meal with its items and photo rows in one batch (no cascades); replaying a delete is a no-op. */
export async function deleteMeal(deps: Deps, id: string): Promise<Ok> {
  const photos = await deps.db.select({ key: meal_photos.storage_path }).from(meal_photos).where(eq(meal_photos.meal_id, id))
  await runBatch(deps, [
    deps.db.delete(meal_items).where(eq(meal_items.meal_id, id)),
    deps.db.delete(meal_photos).where(eq(meal_photos.meal_id, id)),
    deps.db.delete(meals).where(eq(meals.id, id)),
  ])
  if (photos.length > 0) deps.waitUntil(deps.env.FILES.delete(photos.map((p) => p.key)).catch(() => undefined))
  return { ok: true }
}

/** Barcode first (exact), then text matches; deduplicated, at most 20. */
export async function searchFoods(deps: Deps, query: FoodSearchQuery): Promise<Food[]> {
  const sources = createFoodSources(deps)
  const byCode = query.barcode ? await sources.byBarcode(query.barcode) : null
  const byText = query.q ? await sources.search(query.q, { limit: SEARCH_LIMIT }) : []
  const seen = new Set<string>()
  return [...(byCode ? [byCode] : []), ...byText]
    .filter((f) => !seen.has(f.id) && seen.add(f.id))
    .slice(0, SEARCH_LIMIT)
    .map(toFood)
}

export function createFood(deps: Deps, body: FoodCreate): Promise<Food> {
  return createUserFood(deps, body)
}
