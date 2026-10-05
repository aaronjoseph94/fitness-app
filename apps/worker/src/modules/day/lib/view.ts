// Owns: assembling one DayView — the date's targets and v_day row, intake by slot, trend weight, last night's sleep,
// the fast state, the session, the planned session from the active week plan and the active forecast, read in one
// batched round trip.
import { addDays, fastDay, localDate, trendChange, trendWeights, weekdayOf, weekStart } from '@fitness/shared/engine'
import {
  SleepStages,
  WeekPlanContent,
  type DayView,
  type Fast,
  type FastState,
  type MealSlot,
  type Nutrients,
  type SessionBrief,
  type SleepLog,
} from '@fitness/shared/schemas'
import { and, between, count, countDistinct, desc, eq, lte, sql } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import {
  daily_targets,
  fast_logs,
  meal_items,
  meals,
  plan_versions,
  session_sets,
  settings,
  sleep_logs,
  v_day,
  week_plans,
  weight_logs,
  workout_sessions,
  workout_templates,
  type Row,
} from '../../../db'
import type { Deps } from '../../../lib/deps'

const HOUR_MS = 3_600_000
const round2 = (x: number) => Math.round(x * 100) / 100

/** Σ of a meal_items column over the joined confirmed meals (0 when none). */
const total = (col: SQLiteColumn) => sql<number>`coalesce(sum(${col}), 0)`

export type DayCore = Omit<DayView, 'proposals' | 'note'>

export async function buildDay(deps: Deps, date: string): Promise<DayCore> {
  const { db } = deps
  const now = deps.now()
  const [targetRows, vdayRows, slots, weights, sleepRows, fastRows, sessionRows, setRows, weekRows, settingsRows, activeRows] =
    await db.batch([
      db.select().from(daily_targets).where(eq(daily_targets.date, date)),
      db.select().from(v_day).where(eq(v_day.date, date)),
      db
        .select({
          slot: meals.slot,
          meals: countDistinct(meals.id),
          kcal: total(meal_items.kcal),
          protein_g: total(meal_items.protein_g),
          carbs_g: total(meal_items.carbs_g),
          fat_g: total(meal_items.fat_g),
          fibre_g: total(meal_items.fibre_g),
        })
        .from(meals)
        .leftJoin(meal_items, eq(meal_items.meal_id, meals.id))
        .where(and(eq(meals.date, date), eq(meals.status, 'confirmed')))
        .groupBy(meals.slot),
      db
        .select({ date: weight_logs.date, weight_kg: weight_logs.weight_kg })
        .from(weight_logs)
        .where(lte(weight_logs.date, date))
        .orderBy(weight_logs.date),
      db.select().from(sleep_logs).where(eq(sleep_logs.date, date)),
      db
        .select()
        .from(fast_logs)
        .where(between(fast_logs.start_date, addDays(date, -2), date))
        .orderBy(fast_logs.started_at),
      db
        .select({ session: workout_sessions, template_name: workout_templates.name })
        .from(workout_sessions)
        .leftJoin(workout_templates, eq(workout_templates.id, workout_sessions.template_id))
        .where(eq(workout_sessions.date, date))
        .orderBy(desc(workout_sessions.started_at))
        .limit(1),
      db
        .select({
          session_id: session_sets.session_id,
          sets_done: count(),
          volume_kg: sql<number>`coalesce(sum(${session_sets.reps} * ${session_sets.load_kg}), 0)`,
        })
        .from(session_sets)
        .innerJoin(workout_sessions, eq(workout_sessions.id, session_sets.session_id))
        .where(and(eq(workout_sessions.date, date), eq(session_sets.completed, true)))
        .groupBy(session_sets.session_id),
      db
        .select({ plan: week_plans.plan })
        .from(week_plans)
        .where(and(eq(week_plans.week_start, weekStart(date)), eq(week_plans.status, 'active')))
        .limit(1),
      db.select({ fast_hours: settings.fast_hours }).from(settings).limit(1),
      db.select({ forecast: plan_versions.forecast }).from(plan_versions).where(eq(plan_versions.active, true)).limit(1),
    ])

  const t = targetRows[0] ?? null
  const vd = vdayRows[0] ?? null

  // Intake: confirmed meals, by slot (the v_day totals when the date is on the spine).
  const by_slot: Partial<Record<MealSlot, Nutrients>> = {}
  let mealsLogged = 0
  const sum: Nutrients = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0 }
  for (const s of slots) {
    const n: Nutrients = {
      kcal: round2(Number(s.kcal)),
      protein_g: round2(Number(s.protein_g)),
      carbs_g: round2(Number(s.carbs_g)),
      fat_g: round2(Number(s.fat_g)),
      fibre_g: round2(Number(s.fibre_g)),
    }
    by_slot[s.slot] = n
    mealsLogged += s.meals
    for (const k of Object.keys(sum) as (keyof Nutrients)[]) sum[k] += n[k]
  }
  const intakeTotal: Nutrients = vd
    ? {
        kcal: round2(vd.intake_kcal),
        protein_g: round2(vd.intake_protein_g),
        carbs_g: round2(vd.intake_carbs_g),
        fat_g: round2(vd.intake_fat_g),
        fibre_g: round2(vd.intake_fibre_g),
      }
    : { kcal: round2(sum.kcal), protein_g: round2(sum.protein_g), carbs_g: round2(sum.carbs_g), fat_g: round2(sum.fat_g), fibre_g: round2(sum.fibre_g) }

  // Weight: raw weigh-in and the trend (EWMA over every weigh-in up to the date).
  const series = trendWeights(weights, { to: date })
  const point = series.find((p) => p.date === date) ?? null

  const fastHours = settingsRows[0]?.fast_hours ?? 24
  const fast = fastState(fastRows, date, now.getTime(), fastHours)
  const session = sessionRows[0] ? toSessionBrief(sessionRows[0].session, sessionRows[0].template_name, setRows) : null
  const plan = weekRows[0] ? WeekPlanContent.safeParse(weekRows[0].plan) : null

  return {
    date,
    targets: t && {
      date: t.date,
      plan_version_id: t.plan_version_id,
      week_plan_id: t.week_plan_id,
      kcal: t.kcal,
      protein_g: t.protein_g,
      carbs_g: t.carbs_g,
      fat_g: t.fat_g,
      fibre_g: t.fibre_g,
      water_ml: t.water_ml,
      steps: t.steps,
      is_fast_day: t.is_fast_day,
      training_planned: t.training_planned,
    },
    intake: { total: intakeTotal, by_slot, meals_logged: vd?.meals_logged ?? mealsLogged },
    remaining: t && {
      kcal: round2(t.kcal - intakeTotal.kcal),
      protein_g: round2(t.protein_g - intakeTotal.protein_g),
      carbs_g: round2(t.carbs_g - intakeTotal.carbs_g),
      fat_g: round2(t.fat_g - intakeTotal.fat_g),
    },
    water_ml: vd?.water_ml ?? 0,
    steps: vd?.steps ?? null,
    sleep: sleepRows[0] ? toSleepLog(sleepRows[0]) : null,
    // The 0 kcal day is the targets' (one fast day per fast, engine fastDay); without targets, the same rule.
    fast: { ...fast, is_fast_day: t ? t.is_fast_day : fastRows.some((f) => fastDay(f, fastHours) === date) },
    weight: {
      raw_kg: point?.weight_kg ?? null,
      trend_kg: point?.trend_kg ?? null,
      change_7d_kg: point ? (trendChange(series, date, 7) ?? null) : null,
    },
    forecast: activeRows[0]?.forecast ?? null,
    session,
    planned_session: plan?.success ? (plan.data.sessions[weekdayOf(date)] ?? null) : null,
  }
}

/**
 * The fast state on `date`. A fast covers [started_at, end) with end = ended_at, or (running) max(now, start +
 * fast_hours); a fast with no end older than 2 × fast_hours counts as ended. Priority: active > scheduled > ended.
 */
function fastState(rows: Row<typeof fast_logs>[], date: string, nowMs: number, fastHours: number): { state: FastState; fast: Fast | null } {
  const rank: Record<FastState, number> = { active: 3, scheduled: 2, ended: 1, none: 0 }
  let best: { state: FastState; fast: Fast | null } = { state: 'none', fast: null }
  for (const f of rows) {
    const startMs = Date.parse(f.started_at)
    const plannedEndMs = startMs + fastHours * HOUR_MS
    const running = !f.ended_at && startMs <= nowMs && nowMs < startMs + 2 * fastHours * HOUR_MS
    const endMs = f.ended_at ? Date.parse(f.ended_at) : running ? Math.max(nowMs, plannedEndMs) : plannedEndMs
    if (localDate(startMs) > date || localDate(Math.max(startMs, endMs - 1)) < date) continue
    const state: FastState = f.ended_at ? 'ended' : startMs > nowMs ? 'scheduled' : running ? 'active' : 'ended'
    if (rank[state] > rank[best.state])
      best = {
        state,
        fast: {
          id: f.id,
          created_at: f.created_at,
          updated_at: f.updated_at,
          started_at: f.started_at,
          ended_at: f.ended_at,
          planned: f.planned,
          note: f.note,
        },
      }
  }
  return best
}

function toSleepLog(r: Row<typeof sleep_logs>): SleepLog {
  const fromTimes = r.in_bed_at && r.woke_at ? Math.round((Date.parse(r.woke_at) - Date.parse(r.in_bed_at)) / 60_000) : 0
  const stages = r.stages === null ? null : SleepStages.safeParse(r.stages)
  return {
    id: r.id,
    created_at: r.created_at,
    updated_at: r.updated_at,
    date: r.date,
    in_bed_at: r.in_bed_at,
    woke_at: r.woke_at,
    asleep_min: Math.min(24 * 60, Math.max(0, r.asleep_min ?? fromTimes)),
    source: r.source,
    stages: stages?.success ? stages.data : null,
  }
}

function toSessionBrief(
  s: Row<typeof workout_sessions>,
  template_name: string | null,
  sets: { session_id: string; sets_done: number; volume_kg: number }[],
): SessionBrief {
  const agg = sets.find((x) => x.session_id === s.id)
  return {
    id: s.id,
    origin: s.origin,
    template_name,
    started_at: s.started_at,
    ended_at: s.ended_at,
    sets_done: agg?.sets_done ?? 0,
    volume_kg: round2(Number(agg?.volume_kg ?? 0)),
    muscle_scores: s.muscle_scores ?? null,
  }
}
