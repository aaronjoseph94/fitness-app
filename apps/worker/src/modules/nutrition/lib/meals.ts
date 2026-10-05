// Owns: meals as the API returns them — a meal with its items (nutrition per item), computed totals, signed photo
// URLs and its analysis state (the status of meals.analysis_job_id) — reading them in one batched round trip, and turning item inputs into meal_items rows (food items get their
// nutrition from the food's per-100 g values; custom items keep theirs).
import { sumNutrients } from '@fitness/shared/engine'
import type { FileKey, JobStatus, Meal, MealItemInput, MealPhoto } from '@fitness/shared/schemas'
import { asc, eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { ai_jobs, meal_items, meal_photos, meals, type NewRow, type Row } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { signFileUrl } from '../../files'
import { nutritionFor } from '../../food-sources'
import { foodLabel, foodsByIds } from './foods'

type MealRow = Row<typeof meals>
type ItemRow = Row<typeof meal_items>
type PhotoRow = Row<typeof meal_photos>
export type ItemInsert = NewRow<typeof meal_items>

/** meal_items has 15 columns, all bound: floor(100 / 15) = 6 rows per statement. */
const ITEMS_PER_STATEMENT = 6

/** A meal_photos row as the API returns it, with a signed, expiring URL. */
export async function toPhoto(deps: Deps, p: PhotoRow): Promise<MealPhoto> {
  const signed = await signFileUrl(deps.env, p.storage_path as FileKey, undefined, deps.now())
  return { id: p.id, meal_id: p.meal_id, width: p.width ?? 1, height: p.height ?? 1, exif_stripped: p.exif_stripped, url: signed.url }
}

type JobState = { id: string; status: JobStatus }

async function assemble(deps: Deps, mealRows: MealRow[], itemRows: ItemRow[], photoRows: PhotoRow[], jobs: JobState[]): Promise<Meal[]> {
  const photos = await Promise.all(photoRows.map((p) => toPhoto(deps, p)))
  const jobStatus = new Map(jobs.map((j) => [j.id, j.status]))
  return mealRows.map((m) => {
    const items = itemRows
      .filter((i) => i.meal_id === m.id)
      .map((i) => ({
        id: i.id,
        meal_id: i.meal_id,
        food_id: i.food_id,
        description: i.description,
        grams: i.grams,
        kcal: i.kcal,
        protein_g: i.protein_g,
        carbs_g: i.carbs_g,
        fat_g: i.fat_g,
        fibre_g: i.fibre_g,
        confidence: i.confidence,
        estimated: i.estimated,
      }))
    return {
      id: m.id,
      created_at: m.created_at,
      updated_at: m.updated_at,
      date: m.date,
      slot: m.slot,
      eaten_at: m.eaten_at ?? m.created_at,
      input_method: m.input_method,
      raw_text: m.raw_text,
      status: m.status,
      items,
      totals: sumNutrients(items),
      photos: photos.filter((p) => p.meal_id === m.id),
      analysis: m.analysis_job_id && jobStatus.has(m.analysis_job_id) ? { job_id: m.analysis_job_id, status: jobStatus.get(m.analysis_job_id)! } : null,
    }
  })
}

const jobState = { id: ai_jobs.id, status: ai_jobs.status }

/** Every meal on a local date (any status), by eaten_at, items in their order. */
export async function mealsOn(deps: Deps, date: string): Promise<Meal[]> {
  const { db } = deps
  const [m, i, p, j] = await db.batch([
    db.select().from(meals).where(eq(meals.date, date)).orderBy(asc(meals.eaten_at), asc(meals.created_at)),
    db
      .select({ item: meal_items })
      .from(meal_items)
      .innerJoin(meals, eq(meals.id, meal_items.meal_id))
      .where(eq(meals.date, date))
      .orderBy(asc(meal_items.sort_order)),
    db
      .select({ photo: meal_photos })
      .from(meal_photos)
      .innerJoin(meals, eq(meals.id, meal_photos.meal_id))
      .where(eq(meals.date, date))
      .orderBy(asc(meal_photos.created_at)),
    db.select(jobState).from(ai_jobs).innerJoin(meals, eq(meals.analysis_job_id, ai_jobs.id)).where(eq(meals.date, date)),
  ])
  return assemble(
    deps,
    m,
    i.map((r) => r.item),
    p.map((r) => r.photo),
    j,
  )
}

export async function mealById(deps: Deps, id: string): Promise<Meal | null> {
  const { db } = deps
  const [m, i, p, j] = await db.batch([
    db.select().from(meals).where(eq(meals.id, id)),
    db.select().from(meal_items).where(eq(meal_items.meal_id, id)).orderBy(asc(meal_items.sort_order)),
    db.select().from(meal_photos).where(eq(meal_photos.meal_id, id)).orderBy(asc(meal_photos.created_at)),
    db.select(jobState).from(ai_jobs).innerJoin(meals, eq(meals.analysis_job_id, ai_jobs.id)).where(eq(meals.id, id)),
  ])
  if (!m[0]) return null
  return (await assemble(deps, m, i, p, j))[0] ?? null
}

const isFoodItem = (i: MealItemInput): i is Extract<MealItemInput, { food_id: string }> => 'food_id' in i

/**
 * Item inputs → meal_items rows, in order. A food item's nutrition = food per-100 g × grams / 100 (0.1 precision) and
 * its description defaults to "Name (Brand)"; a custom item keeps its own nutrition. Unknown food ids are a 400.
 */
export async function itemRows(deps: Deps, mealId: string, inputs: readonly MealItemInput[]): Promise<ItemInsert[]> {
  const foodMap = await foodsByIds(
    deps,
    inputs.filter(isFoodItem).map((i) => i.food_id),
    { require: true },
  )
  const now = deps.now().toISOString()
  return inputs.map((item, sort_order) => {
    const common = { id: item.id, meal_id: mealId, grams: item.grams, confidence: null, sort_order, created_at: now, updated_at: now }
    if (isFoodItem(item)) {
      const food = foodMap.get(item.food_id)!
      return { ...common, food_id: food.id, description: item.description || foodLabel(food), ...nutritionFor(food, item.grams), estimated: false }
    }
    return {
      ...common,
      food_id: null,
      description: item.description,
      kcal: item.kcal,
      protein_g: item.protein_g,
      carbs_g: item.carbs_g,
      fat_g: item.fat_g,
      fibre_g: item.fibre_g,
      estimated: item.estimated,
    }
  })
}

/** Chunked inserts of meal_items rows (≤ 100 bound parameters per statement). */
export function itemInserts(deps: Deps, rows: readonly ItemInsert[]): BatchItem<'sqlite'>[] {
  const out: BatchItem<'sqlite'>[] = []
  for (let i = 0; i < rows.length; i += ITEMS_PER_STATEMENT) out.push(deps.db.insert(meal_items).values(rows.slice(i, i + ITEMS_PER_STATEMENT)))
  return out
}


