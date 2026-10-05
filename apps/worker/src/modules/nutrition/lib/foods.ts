// Owns: foods as the API returns them (row → Food), looking foods up by id in ≤ 99-id chunks, and Aaron's own foods.
import { Barcode, type Food, type FoodCreate } from '@fitness/shared/schemas'
import { eq, inArray } from 'drizzle-orm'
import { foods, type Row } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { badRequest } from '../../../lib/http-error'

export type FoodRow = Row<typeof foods>

/** Bound parameters per statement are capped at 100. */
const IDS_PER_QUERY = 99

export function toFood(row: FoodRow): Food {
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    source: row.source,
    source_id: row.source_id,
    // Cached rows from external sources may carry codes the contract does not accept; drop them rather than fail.
    barcode: row.barcode !== null && Barcode.safeParse(row.barcode).success ? row.barcode : null,
    name: row.name,
    brand: row.brand,
    serving_g: row.serving_g,
    kcal_per_100g: row.kcal_per_100g,
    protein_g: row.protein_g,
    carbs_g: row.carbs_g,
    fat_g: row.fat_g,
    fibre_g: row.fibre_g,
    sugar_g: row.sugar_g,
    sodium_mg: row.sodium_mg,
  }
}

/** "Name (Brand)" — how a food reads as a meal item's description. */
export const foodLabel = (f: Pick<FoodRow, 'name' | 'brand'>) => (f.brand ? `${f.name} (${f.brand})` : f.name)

/** Foods by id; with `require`, an unknown id is a 400. */
export async function foodsByIds(deps: Deps, ids: readonly string[], opts: { require?: boolean } = {}): Promise<Map<string, FoodRow>> {
  const unique = [...new Set(ids)]
  const out = new Map<string, FoodRow>()
  for (let i = 0; i < unique.length; i += IDS_PER_QUERY) {
    const rows = await deps.db
      .select()
      .from(foods)
      .where(inArray(foods.id, unique.slice(i, i + IDS_PER_QUERY)))
    for (const r of rows) out.set(r.id, r)
  }
  if (opts.require) {
    const missing = unique.filter((id) => !out.has(id))
    if (missing.length) throw badRequest(`Unknown food: ${missing.join(', ')}`)
  }
  return out
}

/** POST /api/foods: a food Aaron enters (source "user"). Replaying the same id returns the stored food. */
export async function createUserFood(deps: Deps, body: FoodCreate): Promise<Food> {
  const now = deps.now().toISOString()
  await deps.db
    .insert(foods)
    .values({
      id: body.id,
      source: 'user',
      source_id: null,
      barcode: body.barcode ?? null,
      name: body.name,
      brand: body.brand ?? null,
      serving_g: body.serving_g ?? null,
      kcal_per_100g: body.kcal_per_100g,
      protein_g: body.protein_g,
      carbs_g: body.carbs_g,
      fat_g: body.fat_g,
      fibre_g: body.fibre_g ?? 0,
      sugar_g: body.sugar_g ?? null,
      sodium_mg: body.sodium_mg ?? null,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoNothing({ target: foods.id })
  const [row] = await deps.db.select().from(foods).where(eq(foods.id, body.id))
  return toFood(row!)
}
