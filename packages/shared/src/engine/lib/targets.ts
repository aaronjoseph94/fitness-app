// Owns: daily targets (SPEC §5, §6) — materialised per local date from the active plan version (defaults + weekday
// overrides) or the active week plan, held to the rails, with fast days and training days applied.
import type { LocalDate, Weekday } from '../../schemas/common'
import { addDays, eachDate, localDate, localMidnight, weekdayOf, weekStart } from './dates'
import type { NutrientsLike, PlanTargetsLike, TargetValuesLike } from './types'

/** Extra water on a fast day (ml). */
export const FAST_DAY_EXTRA_WATER_ML = 500

const HOUR_MS = 3_600_000

/** A fast as stored (structurally a subset of `Fast`); a planned or running fast has no end. */
export type FastWindowLike = { started_at: string; ended_at: string | null }

/**
 * The one local date a fast makes a fast day (SPEC §2 "two 24-hour fasts per month"; §3 fast days enter the forecast
 * as 0 kcal):
 *   window   = [started_at, ended_at ?? started_at + fast_hours)
 *   ended_at − started_at < fast_hours / 2  → null (a mis-tap or a fast broken off early makes no fast day)
 *   else     the local date holding the most of the window; a tie goes to the later date
 * e.g. 19:00 → 19:00 the next day: 5 h on D, 19 h on D + 1 → D + 1; midnight to midnight → that date.
 */
export function fastDay(fast: FastWindowLike, fastHours: number): LocalDate | null {
  const start = Date.parse(fast.started_at)
  const end = fast.ended_at ? Date.parse(fast.ended_at) : start + fastHours * HOUR_MS
  if (end <= start || (fast.ended_at && end - start < (fastHours / 2) * HOUR_MS)) return null
  let best: { date: LocalDate; ms: number } | null = null
  for (let d = localDate(start), last = localDate(end - 1); d <= last; d = addDays(d, 1)) {
    const ms = Math.min(end, localMidnight(addDays(d, 1))) - Math.max(start, localMidnight(d))
    if (best === null || ms >= best.ms) best = { date: d, ms }
  }
  return best?.date ?? null
}

/**
 * An active week plan (structurally a subset of `WeekPlan`); a null session means a rest day. A plan with no session
 * on any day (the Gemini carry-forward draft) leaves training to settings.training_days.
 */
export type WeekPlanLike = {
  id: string
  week_start: LocalDate
  plan: {
    targets: Record<Weekday, NutrientsLike>
    sessions: Record<Weekday, unknown>
    water_ml: number
    steps: number
    fast_dates: readonly LocalDate[]
  }
}

export type TargetsInput = {
  from: LocalDate
  to: LocalDate
  /** The active plan version. */
  plan_version: { id: string; targets: PlanTargetsLike }
  /** settings rails. */
  rails: { calorie_floor: number; protein_min_g: number; fat_min_g: number }
  /** settings.training_days, used for weeks without an active week plan. */
  training_days: readonly Weekday[]
  /** Fast days of the planned, running and ended fasts (`fastDay` of each fast_logs row): the only source of fast days. */
  fast_dates: readonly LocalDate[]
  /** Active week plans; a date in one of their weeks takes its targets from it. */
  week_plans?: readonly WeekPlanLike[]
}

/** Structurally a `DailyTargets` row, plus how hard to train that day. */
export type DayTargets = TargetValuesLike & {
  date: LocalDate
  plan_version_id: string
  week_plan_id: string | null
  is_fast_day: boolean
  training_planned: boolean
  /** full on a training day, light on a training day that is a fast day, rest otherwise. */
  training_load: 'full' | 'light' | 'rest'
}

const MACRO_FIELDS = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g'] as const

/**
 * Daily targets for every date from..to:
 *   base      = active week plan's targets[weekday] (+ its water_ml, steps), else plan override[weekday][f] ?? default[f]
 *   kcal      = max(base.kcal, calorie_floor);  protein = max(base.protein, protein_min);  fat = max(base.fat, fat_min)
 *   carbs     = max(0, round((kcal − protein × 4 − fat × 9) / 4))      (carbs are the remainder)
 *   fast day  (date ∈ fast_dates; a week plan's fast_dates only mirror them): kcal = protein = carbs = fat = fibre = 0,
 *             water = base.water + 500 ml
 *   training_planned = week plan session[weekday] ≠ null   when the week plan has a session on any day,
 *                      else weekday ∈ training_days        (no week plan, or one with every session null)
 */
export function materialiseTargets(input: TargetsInput): DayTargets[] {
  const fasts = new Set(input.fast_dates)
  const weekPlans = new Map((input.week_plans ?? []).map((w) => [w.week_start, w]))
  const { defaults, overrides } = input.plan_version.targets
  const { rails } = input

  return eachDate(input.from, input.to).map((date): DayTargets => {
    const weekday = weekdayOf(date)
    const wp = weekPlans.get(weekStart(date)) ?? null
    const override = overrides[weekday]
    const base: TargetValuesLike = wp
      ? { ...wp.plan.targets[weekday], water_ml: wp.plan.water_ml, steps: wp.plan.steps }
      : {
          kcal: override?.kcal ?? defaults.kcal,
          protein_g: override?.protein_g ?? defaults.protein_g,
          carbs_g: override?.carbs_g ?? defaults.carbs_g,
          fat_g: override?.fat_g ?? defaults.fat_g,
          fibre_g: override?.fibre_g ?? defaults.fibre_g,
          water_ml: override?.water_ml ?? defaults.water_ml,
          steps: override?.steps ?? defaults.steps,
        }
    const is_fast_day = fasts.has(date)
    const training_planned = wp && hasSessions(wp) ? wp.plan.sessions[weekday] != null : input.training_days.includes(weekday)
    const ids = { date, plan_version_id: input.plan_version.id, week_plan_id: wp?.id ?? null, is_fast_day, training_planned }

    if (is_fast_day) {
      const zero = Object.fromEntries(MACRO_FIELDS.map((f) => [f, 0])) as NutrientsLike
      return { ...ids, ...zero, water_ml: base.water_ml + FAST_DAY_EXTRA_WATER_ML, steps: base.steps, training_load: training_planned ? 'light' : 'rest' }
    }
    const kcal = Math.max(base.kcal, rails.calorie_floor)
    const protein_g = Math.max(base.protein_g, rails.protein_min_g)
    const fat_g = Math.max(base.fat_g, rails.fat_min_g)
    const carbs_g = Math.max(0, Math.round((kcal - protein_g * 4 - fat_g * 9) / 4))
    return {
      ...ids,
      kcal,
      protein_g,
      carbs_g,
      fat_g,
      fibre_g: base.fibre_g,
      water_ml: base.water_ml,
      steps: base.steps,
      training_load: training_planned ? 'full' : 'rest',
    }
  })
}

/** The week plan schedules training itself: at least one day has a session. */
function hasSessions(wp: WeekPlanLike): boolean {
  return Object.values(wp.plan.sessions).some((s) => s != null)
}

/** Mean planned intake for the forecast: Σ (is_fast_day ? 0 : kcal) / days (fast days enter as 0 kcal, SPEC §3). */
export function meanPlannedIntake(days: readonly { kcal: number; is_fast_day: boolean }[]): number | null {
  if (days.length === 0) return null
  return days.reduce((s, d) => s + (d.is_fast_day ? 0 : d.kcal), 0) / days.length
}
