// Owns: what confirming a meal sets off — the day_adjustment job for a meal of today (one queued job per date covers
// several confirms) — and the auto-confirm sweep step: a meal in review whose every item the AI is sure of (confidence
// ≥ 0.8) and that nobody touched for 10 minutes is confirmed (SPEC §6 "auto-confirm after 10 min").
import { addDays, today } from '@fitness/shared/engine'
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { meal_items, meals } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { jobInsertOnce, runSoon } from '../../jobs'

/** Every item at or above this confidence (meal_items.confidence: min of the AI's and the food match's). */
export const AUTO_CONFIRM_MIN_CONFIDENCE = 0.8
/** Minutes a meal sits in review, untouched (updated_at), before auto-confirm. */
export const AUTO_CONFIRM_AFTER_MS = 10 * 60_000
/** The card after a meal is user-facing: it runs before background work. */
const DAY_ADJUSTMENT_PRIORITY = 8
/** Review meals older than this many days are left for Aaron (a stale review is not "just logged"). */
const AUTO_CONFIRM_DAYS = 2

/**
 * The day_adjustment job for a meal confirmed on `date`: only for today (a past day has no next meal), and none when
 * one is already queued for that date. Put `statement` in the caller's batch, then runSoon(id).
 */
export async function dayAdjustmentAfterConfirm(deps: Deps, meal: { id: string; date: string }) {
  if (meal.date !== today(deps.now())) return null
  return jobInsertOnce(
    deps,
    {
      type: 'day_adjustment',
      payload: { date: meal.date, trigger: 'meal_confirmed', meal_id: meal.id, fast_id: null },
      priority: DAY_ADJUSTMENT_PRIORITY,
    },
    { date: meal.date },
  )
}

/**
 * The sweep step: confirm every meal of the last two local days that is in 'review', was last changed at least 10 min
 * ago, has at least one item, and has no item with confidence null (added by hand) or under 0.8. Queues the
 * day_adjustment for today's. Returns how many meals it confirmed.
 */
export async function autoConfirmMeals(deps: Deps): Promise<number> {
  const now = deps.now()
  const cutoff = new Date(now.getTime() - AUTO_CONFIRM_AFTER_MS).toISOString()
  const ready = await deps.db
    .select({ id: meals.id, date: meals.date })
    .from(meals)
    .where(
      and(
        gte(meals.date, addDays(today(now), -AUTO_CONFIRM_DAYS)),
        eq(meals.status, 'review'),
        lte(meals.updated_at, cutoff),
        sql`EXISTS (SELECT 1 FROM ${meal_items} WHERE ${meal_items.meal_id} = ${meals.id})`,
        sql`NOT EXISTS (SELECT 1 FROM ${meal_items} WHERE ${meal_items.meal_id} = ${meals.id} AND (${meal_items.confidence} IS NULL OR ${meal_items.confidence} < ${AUTO_CONFIRM_MIN_CONFIDENCE}))`,
      ),
    )
  if (ready.length === 0) return 0

  const statements: BatchItem<'sqlite'>[] = [
    deps.db
      .update(meals)
      .set({ status: 'confirmed', updated_at: now.toISOString() })
      .where(and(inArray(meals.id, ready.map((m) => m.id)), eq(meals.status, 'review'))),
  ]
  const todays = ready.find((m) => m.date === today(now))
  const job = todays ? await dayAdjustmentAfterConfirm(deps, todays) : null
  if (job) statements.push(job.statement)
  const [first, ...rest] = statements
  await deps.db.batch([first!, ...rest])
  if (job) runSoon(deps, job.id)
  return ready.length
}
