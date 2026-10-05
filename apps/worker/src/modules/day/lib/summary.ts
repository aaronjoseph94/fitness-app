// Owns: the per-day series behind the Progress charts and the weekly review — one v_day range read plus the trend,
// kcal by slot, bedtimes and training volume, batched into one round trip.
import { trendWeights } from '@fitness/shared/engine'
import type { DaySummary, MealSlot } from '@fitness/shared/schemas'
import { and, between, eq, lte, sql } from 'drizzle-orm'
import { meal_items, meals, session_sets, sleep_logs, v_day, weight_logs, workout_sessions } from '../../../db'
import type { Deps } from '../../../lib/deps'

const round2 = (x: number) => Math.round(x * 100) / 100

/** DaySummary for every spine date in from..to (dates without daily_targets are not on the spine and are omitted). */
export async function buildDays(deps: Deps, range: { from: string; to: string }): Promise<DaySummary[]> {
  const { db } = deps
  const { from, to } = range
  const [rows, weights, slotKcal, sleeps, volumes] = await db.batch([
    db.select().from(v_day).where(between(v_day.date, from, to)).orderBy(v_day.date),
    db
      .select({ date: weight_logs.date, weight_kg: weight_logs.weight_kg })
      .from(weight_logs)
      .where(lte(weight_logs.date, to))
      .orderBy(weight_logs.date),
    db
      .select({ date: meals.date, slot: meals.slot, kcal: sql<number>`coalesce(sum(${meal_items.kcal}), 0)` })
      .from(meals)
      .innerJoin(meal_items, eq(meal_items.meal_id, meals.id))
      .where(and(between(meals.date, from, to), eq(meals.status, 'confirmed')))
      .groupBy(meals.date, meals.slot),
    db
      .select({ date: sleep_logs.date, in_bed_at: sleep_logs.in_bed_at })
      .from(sleep_logs)
      .where(between(sleep_logs.date, from, to)),
    db
      .select({
        date: workout_sessions.date,
        volume_kg: sql<number>`coalesce(sum(${session_sets.reps} * ${session_sets.load_kg}), 0)`,
      })
      .from(session_sets)
      .innerJoin(workout_sessions, eq(workout_sessions.id, session_sets.session_id))
      .where(and(between(workout_sessions.date, from, to), eq(session_sets.completed, true)))
      .groupBy(workout_sessions.date),
  ])

  const trend = new Map(trendWeights(weights, { from, to }).map((p) => [p.date, p.trend_kg]))
  const bySlot = new Map<string, Partial<Record<MealSlot, number>>>()
  for (const s of slotKcal) bySlot.set(s.date, { ...bySlot.get(s.date), [s.slot]: round2(Number(s.kcal)) })
  const bedtime = new Map(sleeps.map((s) => [s.date, s.in_bed_at]))
  const volume = new Map(volumes.map((v) => [v.date, round2(Number(v.volume_kg))]))

  return rows.map((r) => ({
    date: r.date,
    weight_kg: r.weight_kg,
    trend_kg: trend.get(r.date) ?? null,
    intake: {
      kcal: round2(r.intake_kcal),
      protein_g: round2(r.intake_protein_g),
      carbs_g: round2(r.intake_carbs_g),
      fat_g: round2(r.intake_fat_g),
      fibre_g: round2(r.intake_fibre_g),
    },
    kcal_by_slot: bySlot.get(r.date) ?? {},
    meals_logged: r.meals_logged,
    water_ml: r.water_ml,
    steps: r.steps,
    active_kcal: r.active_kcal,
    sleep_min: r.asleep_min,
    in_bed_at: bedtime.get(r.date) ?? null,
    is_fast_day: r.is_fast_day || r.fasted,
    sessions_done: r.sessions_done,
    volume_kg: volume.get(r.date) ?? 0,
    targets: {
      kcal: r.target_kcal,
      protein_g: r.target_protein_g,
      carbs_g: r.target_carbs_g,
      fat_g: r.target_fat_g,
      fibre_g: r.target_fibre_g,
      water_ml: r.target_water_ml,
      steps: r.target_steps,
    },
  }))
}
