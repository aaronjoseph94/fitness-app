// Owns: the weekly review's engine aggregate (SPEC §8) — one Monday–Sunday of v_day rows rolled up into the weekly
// metrics, and how each fast of the week went.
import type { LocalDate } from '../../schemas/common'
import { adherence } from './adherence'
import { addDays } from './dates'
import { isLoggedIntakeDay } from './expenditure'
import { mean, round } from './math'
import { trendOn } from './trend'
import type { DayRow, NutrientsLike } from './types'

/** A fast counts as completed at this share of its planned length (24 h → 22.8 h). */
export const FAST_COMPLETE_SHARE = 0.95

/** A `fast_logs` row. */
export type FastLike = { id: string; started_at: string; ended_at: string | null }

/** Structurally a `FastOutcome`. */
export type FastResult = { fast_id: string; started_at: string; ended_at: string | null; hours: number; status: 'completed' | 'partial' | 'active' }

/** Structurally `WeeklyMetrics` without the parts the engine does not see in v_day (volume_by_muscle, prs, forecast). */
export type WeekAggregate = {
  week_start: LocalDate
  trend_start_kg: number | null
  trend_end_kg: number | null
  trend_change_kg: number | null
  intake_avg: NutrientsLike
  days_logged: number
  protein_adherence: number
  water_avg_ml: number
  steps_avg: number | null
  sleep_avg_min: number | null
  sessions_done: number
  sessions_planned: number
  fasts: FastResult[]
  logging_adherence: number
}

/**
 * The week week_start … week_start + 6 (pass the Sunday before too, for the trend start):
 *   trend_start = trend(week_start − 1) ?? trend(week_start);  trend_end = trend(week_start + 6);  change = end − start
 *   logged day = isLoggedIntakeDay (meals_logged > 0 ∨ is_fast_day);  intake_avg = mean intake over logged days (a fast day counts at its
 *     intake, 0 kcal when nothing eaten), kcal whole, grams to 0.1
 *   protein_adherence = |logged non-fast days with protein_g ≥ target| / |logged non-fast days with a target| (0 if none)
 *   water_avg_ml = mean over days with water > 0;  steps_avg, sleep_avg_min = mean over days with data (whole numbers)
 *   sessions_done = Σ sessions_done;  logging_adherence = adherent days / 7
 *   fast hours = (ended_at ?? now) − started_at;  status = active (no end) | completed (≥ 95 % of fast_hours) | partial
 */
export function weeklyMetrics(input: {
  week_start: LocalDate
  days: readonly DayRow[]
  sessions_planned: number
  fasts?: readonly FastLike[]
  /** Planned fast length (settings.fast_hours, 24). */
  fast_hours?: number
  /** For an active fast's hours so far. */
  now: string
}): WeekAggregate {
  const end = addDays(input.week_start, 6)
  const week = input.days.filter((d) => d.date >= input.week_start && d.date <= end)
  const trend_start_kg = trendOn(input.days, addDays(input.week_start, -1)) ?? trendOn(input.days, input.week_start)
  const trend_end_kg = trendOn(input.days, end)

  const logged = week.filter(isLoggedIntakeDay)
  const avg = (f: keyof NutrientsLike, dp: number) => round(mean(logged.map((d) => d.intake[f])) ?? 0, dp)
  const eaten = logged.filter((d) => !d.is_fast_day && d.targets !== null)
  const avgOf = (xs: number[]) => {
    const m = mean(xs)
    return m === null ? null : Math.round(m)
  }
  const fastHours = input.fast_hours ?? 24

  return {
    week_start: input.week_start,
    trend_start_kg,
    trend_end_kg,
    trend_change_kg: trend_start_kg === null || trend_end_kg === null ? null : trend_end_kg - trend_start_kg,
    intake_avg: { kcal: avg('kcal', 0), protein_g: avg('protein_g', 1), carbs_g: avg('carbs_g', 1), fat_g: avg('fat_g', 1), fibre_g: avg('fibre_g', 1) },
    days_logged: logged.length,
    protein_adherence: eaten.length ? eaten.filter((d) => d.intake.protein_g >= d.targets!.protein_g).length / eaten.length : 0,
    water_avg_ml: avgOf(week.filter((d) => d.water_ml > 0).map((d) => d.water_ml)) ?? 0,
    steps_avg: avgOf(week.flatMap((d) => (d.steps === null ? [] : [d.steps]))),
    sleep_avg_min: avgOf(week.flatMap((d) => (d.sleep_min === null ? [] : [d.sleep_min]))),
    sessions_done: week.reduce((n, d) => n + d.sessions_done, 0),
    sessions_planned: input.sessions_planned,
    fasts: (input.fasts ?? []).map((f): FastResult => {
      const hours = Math.max(0, (Date.parse(f.ended_at ?? input.now) - Date.parse(f.started_at)) / 3_600_000)
      const status = f.ended_at === null ? 'active' : hours >= FAST_COMPLETE_SHARE * fastHours ? 'completed' : 'partial'
      return { fast_id: f.id, started_at: f.started_at, ended_at: f.ended_at, hours: round(hours, 1), status }
    }),
    logging_adherence: adherence(week, 7).share,
  }
}
