// Owns: recent foods — the foods of confirmed meals in the last N local days (default 30), most used first, each with
// the grams and nutrition of its latest use (GET /api/foods/recent, the one-tap "recents" row).
import { addDays, today } from '@fitness/shared/engine'
import type { RecentFood, RecentFoodsQuery } from '@fitness/shared/schemas'
import { and, desc, eq, gt, gte, isNotNull } from 'drizzle-orm'
import { meal_items, meals } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { nutritionFor } from '../../food-sources'
import { foodsByIds, toFood } from './foods'

const DEFAULT_DAYS = 30
const DEFAULT_LIMIT = 20
/** Item rows read at most (a month of meals is a few hundred). */
const MAX_ROWS = 1000

/** Foods by uses (desc), then most recent use; `grams` and `nutrients` are those of the latest use. */
export async function recentFoods(deps: Deps, q: RecentFoodsQuery): Promise<RecentFood[]> {
  const since = addDays(today(deps.now()), -((q.days ?? DEFAULT_DAYS) - 1))
  const rows = await deps.db
    .select({ food_id: meal_items.food_id, grams: meal_items.grams, eaten_at: meals.eaten_at, created_at: meals.created_at })
    .from(meal_items)
    .innerJoin(meals, eq(meals.id, meal_items.meal_id))
    .where(and(gte(meals.date, since), eq(meals.status, 'confirmed'), isNotNull(meal_items.food_id), gt(meal_items.grams, 0)))
    .orderBy(desc(meals.eaten_at), desc(meals.created_at))
    .limit(MAX_ROWS)

  const tally = new Map<string, { uses: number; grams: number; last_used_at: string }>()
  for (const r of rows) {
    const t = tally.get(r.food_id!)
    if (t) t.uses++
    else tally.set(r.food_id!, { uses: 1, grams: r.grams, last_used_at: r.eaten_at ?? r.created_at })
  }
  const top = [...tally]
    .sort(([, a], [, b]) => b.uses - a.uses || b.last_used_at.localeCompare(a.last_used_at))
    .slice(0, q.limit ?? DEFAULT_LIMIT)
  const foodMap = await foodsByIds(
    deps,
    top.map(([id]) => id),
  )
  return top.flatMap(([id, t]) => {
    const food = foodMap.get(id)
    return food ? [{ food: toFood(food), uses: t.uses, grams: t.grams, nutrients: nutritionFor(food, t.grams), last_used_at: t.last_used_at }] : []
  })
}
