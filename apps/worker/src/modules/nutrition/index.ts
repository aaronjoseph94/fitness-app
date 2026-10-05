// Owns: nutrition — meals (each with items, computed totals and photos), foods and favourites (incl. recipes), and the
// meal side of the AI pipeline (what meal_analysis reads and when its items may land; auto-confirm).
// Interface:
//   listMeals(deps, date) / getMeal(deps, id)   → Meal[] / Meal   with `analysis` = the status of the meal's newest
//        meal_analysis job (meals.analysis_job_id, set whenever one is queued for it)
//   createMeal(deps, MealCreate)  → Meal   by input method: manual/barcode items (food items priced per 100 g) and a
//        favourite (copied, scaled) are confirmed at once; text/voice store raw_text as 'parsing' and queue a
//        meal_analysis job in the same batch; photo waits as 'parsing' for its photos. A replayed id returns the meal.
//        400 when eaten_at falls on a later local date than today (create or patch).
//   updateMeal(deps, id, MealPatch) → Meal  slot / eaten_at (date recomputed) / items (replace all) / confirm
//   deleteMeal(deps, id)          → Ok     items, photos and the meal in one batch; R2 objects removed after
//   addMealPhoto(deps, id, query, bytes) → MealPhoto   R2 meal-photos/<meal>/<photo>.(jpg|webp); a photo meal not yet
//        confirmed goes (back) to 'parsing' with one queued meal_analysis job
//   Confirming a meal of today (create, patch, auto-confirm), editing a confirmed one's items or date, or deleting one
//   queues one day_adjustment job for today, so the card never contradicts the day's numbers.
//   analysisInput / applyAnalysis / releaseForReview   the meal_analysis job's reads and guarded writes (lib/analysis)
//   autoConfirmMeals(deps)        → count  registered as the 'meal_auto_confirm' sweep step: review meals untouched
//        for 10 min whose every item has confidence ≥ 0.8
//   searchFoods(deps, { q?, barcode? }) → Food[]   barcode (cache, then Open Food Facts) and text (cache, then OFF/USDA)
//   recentFoods(deps, { days?, limit? }) → RecentFood[]   foods of the last 30 days' confirmed meals, most used first
//   createFood(deps, FoodCreate)  → Food   source 'user'; idempotent by id
//   listFavourites / createFavourite / updateFavourite / deleteFavourite → Favourite(s) with the nutrition and named
//        foods of one default portion
import { localDate, today } from '@fitness/shared/engine'
import type { Food, FoodCreate, FoodSearchQuery, Meal, MealCreate, MealItemInput, MealPatch, Ok } from '@fitness/shared/schemas'
import { count, eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { meal_items, meal_photos, meals, runBatch } from '../../db'
import type { Deps } from '../../lib/deps'
import { badRequest, notFound } from '../../lib/http-error'
import { createFoodSources } from '../food-sources'
import { jobInsert, registerSweepStep, runSoon } from '../jobs'
import { autoConfirmMeals, dayAdjustmentAfterConfirm } from './lib/confirm'
import { favouriteItemInputs } from './lib/favourites'
import { createUserFood, toFood } from './lib/foods'
import { itemInserts, itemRows, mealById, mealsOn } from './lib/meals'
import { MEAL_ANALYSIS_PRIORITY } from './lib/photos'

export { analysisInput, applyAnalysis, releaseForReview, type AnalysedItem, type AnalysisInput } from './lib/analysis'
export { AUTO_CONFIRM_AFTER_MS, AUTO_CONFIRM_MIN_CONFIDENCE, autoConfirmMeals } from './lib/confirm'
export { createFavourite, deleteFavourite, listFavourites, updateFavourite } from './lib/favourites'
export { addMealPhoto } from './lib/photos'
export { recentFoods } from './lib/recent'

/** Most foods a search returns. */
const SEARCH_LIMIT = 20

/** A phone clock a few minutes ahead of the Worker's at midnight still logs "today". */
const CLOCK_SKEW_MS = 5 * 60_000

/** 400 when a meal's eaten_at falls on a later Edmonton date than today: only what was eaten is logged. */
function assertEaten(deps: Deps, eaten_at: string): void {
  const date = localDate(eaten_at)
  if (date > today(new Date(deps.now().getTime() + CLOCK_SKEW_MS))) throw badRequest(`${date} has not happened yet; log a meal once it is eaten`)
}

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
  assertEaten(deps, body.eaten_at)

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
  const adjust = status === 'confirmed' ? await dayAdjustmentAfterConfirm(deps, { id: body.id, date: localDate(body.eaten_at) }) : null
  const statements: BatchItem<'sqlite'>[] = [
    deps.db.insert(meals).values({
      id: body.id,
      date: localDate(body.eaten_at),
      slot: body.slot,
      eaten_at: body.eaten_at,
      input_method: body.input_method,
      raw_text,
      status,
      analysis_job_id: job?.id ?? null,
      actor: deps.actor,
      created_at: now,
      updated_at: now,
    }),
    ...itemInserts(deps, items),
    ...(job ? [job.statement] : []),
    ...(adjust ? [adjust.statement] : []),
  ]
  try {
    await runBatch(deps.db, statements)
  } catch (e) {
    const raced = await mealById(deps, body.id) // a concurrent replay of the same id won
    if (raced) return raced
    throw e
  }
  if (job) runSoon(deps, job.id)
  if (adjust) runSoon(deps, adjust.id)
  return getMeal(deps, body.id)
}

/**
 * Items replace the whole list (a 'parsing' meal moves to 'review'); confirm: true confirms it, and confirming a meal
 * of today queues the day_adjustment card. A confirmed meal keeps at least one item (400 otherwise: delete it).
 */
export async function updateMeal(deps: Deps, id: string, patch: MealPatch): Promise<Meal> {
  const [meal] = await deps.db.select().from(meals).where(eq(meals.id, id))
  if (!meal) throw notFound('Meal')
  if (patch.eaten_at) assertEaten(deps, patch.eaten_at)
  // A confirmed meal counts as a logged meal (adherence): it must hold something. An empty one is deleted instead.
  if (patch.confirm || meal.status === 'confirmed') {
    const items = patch.items?.length ?? (await deps.db.select({ n: count() }).from(meal_items).where(eq(meal_items.meal_id, id)))[0]!.n
    if (items === 0) throw badRequest('A confirmed meal needs at least one item; delete the meal instead')
  }
  const now = deps.now().toISOString()
  let status = meal.status
  const statements: BatchItem<'sqlite'>[] = []
  if (patch.items !== undefined) {
    statements.push(deps.db.delete(meal_items).where(eq(meal_items.meal_id, id)), ...itemInserts(deps, await itemRows(deps, id, patch.items)))
    if (status === 'parsing') status = 'review'
  }
  const date = patch.eaten_at ? localDate(patch.eaten_at) : meal.date
  // The card follows the day: confirming a meal, or changing what a confirmed meal counts (items, its time or date),
  // writes a fresh one for today (moving a meal off today refreshes today's card too).
  const confirming = patch.confirm === true && meal.status !== 'confirmed'
  const counted = meal.status === 'confirmed' && (patch.items !== undefined || date !== meal.date)
  const adjust = confirming || counted ? await dayAdjustmentAfterConfirm(deps, { id, date: date === today(deps.now()) ? date : meal.date }) : null
  if (adjust) statements.push(adjust.statement)
  if (patch.confirm) status = 'confirmed'
  await runBatch(deps.db, [
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
  if (adjust) runSoon(deps, adjust.id)
  return getMeal(deps, id)
}

/** Delete a meal with its items and photo rows in one batch (no cascades); replaying a delete is a no-op. */
export async function deleteMeal(deps: Deps, id: string): Promise<Ok> {
  const [[meal], photos] = await deps.db.batch([
    deps.db.select({ date: meals.date, status: meals.status }).from(meals).where(eq(meals.id, id)),
    deps.db.select({ key: meal_photos.storage_path }).from(meal_photos).where(eq(meal_photos.meal_id, id)),
  ])
  // A confirmed meal of today leaving the day writes a fresh day adjustment card (its numbers changed).
  const adjust = meal?.status === 'confirmed' ? await dayAdjustmentAfterConfirm(deps, { id, date: meal.date }) : null
  await runBatch(deps.db, [
    deps.db.delete(meal_items).where(eq(meal_items.meal_id, id)),
    deps.db.delete(meal_photos).where(eq(meal_photos.meal_id, id)),
    deps.db.delete(meals).where(eq(meals.id, id)),
    ...(adjust ? [adjust.statement] : []),
  ])
  if (adjust) runSoon(deps, adjust.id)
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

// Meals the AI is sure of confirm themselves after 10 minutes in review (SPEC §6).
registerSweepStep('meal_auto_confirm', autoConfirmMeals)
