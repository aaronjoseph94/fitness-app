// Owns: favourites — one-tap repeats: a food with default grams, or a recipe (foods with grams) — with the nutrition of
// one default portion and the named foods in it, their sort order, deleting one, and the meal items it expands to.
import { sumNutrients } from '@fitness/shared/engine'
import type { Favourite, FavouriteCreate, FavouriteItem, FavouritePatch, MealItemInput, Nutrients, Ok, RecipeItem } from '@fitness/shared/schemas'
import { asc, eq, max } from 'drizzle-orm'
import { favorites, type Row } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { badRequest, notFound } from '../../../lib/http-error'
import { nutritionFor } from '../../food-sources'
import { foodLabel, foodsByIds, type FoodRow } from './foods'

type FavouriteRow = Row<typeof favorites>

const foodIdsOf = (r: Pick<FavouriteRow, 'food_id' | 'recipe'>) => (r.food_id ? [r.food_id] : (r.recipe ?? []).map((i) => i.food_id))

/**
 * Row → Favourite; totals = nutrition of one default portion (food × default_grams, or Σ recipe items); `items` names
 * each food ("Name (Brand)") with its grams and kcal. A food that no longer exists counts as 0.
 */
function toFavourite(r: FavouriteRow, foodMap: Map<string, FoodRow>): Favourite | null {
  const portion = (food_id: string, grams: number): Nutrients => {
    const food = foodMap.get(food_id)
    return food ? nutritionFor(food, grams) : { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0 }
  }
  const item = (food_id: string, grams: number): FavouriteItem => {
    const food = foodMap.get(food_id)
    return { food_id, name: food ? foodLabel(food) : 'Unknown food', grams, kcal: portion(food_id, grams).kcal }
  }
  const base = { id: r.id, created_at: r.created_at, updated_at: r.updated_at, label: r.label, sort_order: r.sort_order }
  if (r.food_id && r.default_grams)
    return {
      ...base,
      kind: 'food',
      food_id: r.food_id,
      default_grams: r.default_grams,
      totals: portion(r.food_id, r.default_grams),
      items: [item(r.food_id, r.default_grams)],
    }
  if (r.recipe && r.recipe.length > 0)
    return {
      ...base,
      kind: 'recipe',
      recipe: r.recipe,
      totals: sumNutrients(r.recipe.map((i) => portion(i.food_id, i.grams))),
      items: r.recipe.map((i) => item(i.food_id, i.grams)),
    }
  return null
}

async function favouriteRow(deps: Deps, id: string): Promise<FavouriteRow | null> {
  const [row] = await deps.db.select().from(favorites).where(eq(favorites.id, id))
  return row ?? null
}

async function present(deps: Deps, row: FavouriteRow): Promise<Favourite> {
  const fav = toFavourite(row, await foodsByIds(deps, foodIdsOf(row)))
  if (!fav) throw badRequest('Favourite has neither a food nor a recipe')
  return fav
}

export async function listFavourites(deps: Deps): Promise<Favourite[]> {
  const rows = await deps.db.select().from(favorites).orderBy(asc(favorites.sort_order), asc(favorites.created_at))
  const foodMap = await foodsByIds(deps, rows.flatMap(foodIdsOf))
  return rows.map((r) => toFavourite(r, foodMap)).filter((f): f is Favourite => f !== null)
}

/** POST /api/favorites. Replaying an id returns the stored favourite; sort_order defaults to the end of the list. */
export async function createFavourite(deps: Deps, body: FavouriteCreate): Promise<Favourite> {
  const existing = await favouriteRow(deps, body.id)
  if (existing) return present(deps, existing)
  const recipe: RecipeItem[] | null = body.kind === 'recipe' ? body.recipe : null
  const food_id = body.kind === 'food' ? body.food_id : null
  await foodsByIds(deps, foodIdsOf({ food_id, recipe }), { require: true })
  const [last] = await deps.db.select({ n: max(favorites.sort_order) }).from(favorites)
  const now = deps.now().toISOString()
  await deps.db
    .insert(favorites)
    .values({
      id: body.id,
      food_id,
      recipe,
      label: body.label,
      default_grams: body.kind === 'food' ? body.default_grams : null,
      sort_order: body.sort_order ?? (last?.n ?? -1) + 1,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoNothing({ target: favorites.id })
  return present(deps, (await favouriteRow(deps, body.id))!)
}

/** PATCH /api/favorites/:id — label, order, a food favourite's grams, or a recipe's items. */
export async function updateFavourite(deps: Deps, id: string, patch: FavouritePatch): Promise<Favourite> {
  const row = await favouriteRow(deps, id)
  if (!row) throw notFound('Favourite')
  const isRecipe = row.food_id === null
  if (patch.default_grams !== undefined && isRecipe) throw badRequest('default_grams applies to food favourites only')
  if (patch.recipe !== undefined && !isRecipe) throw badRequest('recipe applies to recipe favourites only')
  if (patch.recipe) await foodsByIds(deps, patch.recipe.map((i) => i.food_id), { require: true })
  await deps.db
    .update(favorites)
    .set({
      label: patch.label ?? row.label,
      sort_order: patch.sort_order ?? row.sort_order,
      default_grams: patch.default_grams ?? row.default_grams,
      recipe: patch.recipe ?? row.recipe,
      updated_at: deps.now().toISOString(),
    })
    .where(eq(favorites.id, id))
  return present(deps, (await favouriteRow(deps, id))!)
}

/** DELETE /api/favorites/:id. Meals logged from it keep their items; replaying the delete is a no-op. */
export async function deleteFavourite(deps: Deps, id: string): Promise<Ok> {
  await deps.db.delete(favorites).where(eq(favorites.id, id))
  return { ok: true }
}

/** The meal item inputs a favourite expands to, each scaled by `scale` (fresh item ids). Unknown favourite → 400. */
export async function favouriteItemInputs(deps: Deps, id: string, scale: number): Promise<MealItemInput[]> {
  const row = await favouriteRow(deps, id)
  if (!row) throw badRequest(`Unknown favourite: ${id}`)
  const parts = row.food_id && row.default_grams ? [{ food_id: row.food_id, grams: row.default_grams }] : (row.recipe ?? [])
  if (parts.length === 0) throw badRequest('Favourite has neither a food nor a recipe')
  return parts.map((p) => ({ id: crypto.randomUUID(), food_id: p.food_id, grams: p.grams * scale }))
}
