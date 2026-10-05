// Owns: the meal side of meal analysis — what a meal_analysis job reads (the meal, its raw text and its photo keys,
// only ever under meal-photos/<meal_id>/) and the write policy for its result: items land only on a meal still waiting
// for them, in one batch with the job's note, and a failed analysis leaves the meal in review with its raw text.
import type { InputMethod, MealSlot, MealStatus, Nutrients } from '@fitness/shared/schemas'
import { and, asc, count, eq, ne } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { meal_items, meal_photos, meals } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { itemInserts, runBatch, type ItemInsert } from './meals'

export interface AnalysisInput {
  meal: { id: string; date: string; slot: MealSlot; input_method: InputMethod; raw_text: string | null; status: MealStatus; item_count: number }
  /** The meal's own photos, oldest first. `key` is always meal-photos/<meal_id>/<photo_id>.(jpg|webp). */
  photos: { id: string; key: string; mime: 'image/jpeg' | 'image/webp' }[]
}

/** One analysed item ready to store: matched to a food (food_id) or an LLM estimate (estimated, food_id null). */
export interface AnalysedItem {
  description: string
  grams: number
  food_id: string | null
  nutrients: Nutrients
  confidence: number
  estimated: boolean
}

const mimeOf = (key: string) => (key.endsWith('.webp') ? ('image/webp' as const) : ('image/jpeg' as const))

/** The meal and its photos for meal_analysis, or null when the meal is gone. */
export async function analysisInput(deps: Deps, mealId: string): Promise<AnalysisInput | null> {
  const { db } = deps
  const [[meal], [items], photos] = await db.batch([
    db.select().from(meals).where(eq(meals.id, mealId)),
    db.select({ n: count() }).from(meal_items).where(eq(meal_items.meal_id, mealId)),
    db.select().from(meal_photos).where(eq(meal_photos.meal_id, mealId)).orderBy(asc(meal_photos.created_at)),
  ])
  if (!meal) return null
  const prefix = `meal-photos/${mealId}/`
  return {
    meal: {
      id: meal.id,
      date: meal.date,
      slot: meal.slot,
      input_method: meal.input_method,
      raw_text: meal.raw_text,
      status: meal.status,
      item_count: items?.n ?? 0,
    },
    // Privacy rail: only this meal's own photo objects can ever reach the LLM.
    photos: photos.filter((p) => p.storage_path.startsWith(prefix)).map((p) => ({ id: p.id, key: p.storage_path, mime: mimeOf(p.storage_path) })),
  }
}

/**
 * Store an analysis on a meal still waiting for it: status 'parsing', or 'review' with no items (an earlier attempt
 * failed and Aaron has not added any). Not when it was confirmed or edited meanwhile, or gained photos the analysis did
 * not see (`photo_ids`; the job queued for them will write instead). Items replace the list and the meal moves to
 * 'review'; `extra` statements (the job's note) go in the same batch. Returns whether it wrote.
 */
export async function applyAnalysis(
  deps: Deps,
  mealId: string,
  result: { items: readonly AnalysedItem[]; photo_ids: readonly string[] },
  extra: BatchItem<'sqlite'>[] = [],
): Promise<boolean> {
  const current = await analysisInput(deps, mealId)
  if (!current) return false
  const { status, item_count } = current.meal
  const waiting = status === 'parsing' || (status === 'review' && item_count === 0)
  const seen = new Set(result.photo_ids)
  if (!waiting || current.photos.some((p) => !seen.has(p.id))) return false

  const now = deps.now().toISOString()
  const rows: ItemInsert[] = result.items.map((item, sort_order) => ({
    id: crypto.randomUUID(),
    meal_id: mealId,
    food_id: item.food_id,
    description: item.description,
    grams: item.grams,
    ...item.nutrients,
    confidence: item.confidence,
    estimated: item.estimated,
    sort_order,
    created_at: now,
    updated_at: now,
  }))
  await runBatch(deps, [
    deps.db
      .update(meals)
      .set({ status: 'review', updated_at: now })
      .where(and(eq(meals.id, mealId), ne(meals.status, 'confirmed'))),
    deps.db.delete(meal_items).where(eq(meal_items.meal_id, mealId)),
    ...itemInserts(deps, rows),
    ...extra,
  ])
  return true
}

/** A meal whose analysis failed moves from 'parsing' to 'review', raw text kept, so Aaron can add items himself. */
export async function releaseForReview(deps: Deps, mealId: string): Promise<void> {
  await deps.db
    .update(meals)
    .set({ status: 'review', updated_at: deps.now().toISOString() })
    .where(and(eq(meals.id, mealId), eq(meals.status, 'parsing')))
}
