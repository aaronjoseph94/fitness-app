// Owns: the forecast (SPEC §3, §9) — weekly loss rate from the expenditure estimate and planned intake, weeks to the
// goal from the current trend weight, the finish date, and the ±20 % confidence band.
import type { LocalDate } from '../../schemas/common'
import { addDays, daysBetween } from './dates'

/** Energy in one kg of body weight lost (SPEC §3). */
export const KCAL_PER_KG = 7700
/** Half-width of the forecast band as a share of the rate (SPEC §9). */
export const FORECAST_BAND = 0.2
/** The last date a LocalDate ("YYYY-MM-DD") can hold; a finish later than this is no date at all. */
const LAST_DATE = '9999-12-31'

export type ForecastInput = {
  /** The date the forecast starts from (the date of `trend_kg`). */
  as_of: LocalDate
  /** Current expenditure estimate (kcal/day). */
  tdee_est: number
  /** Mean planned daily intake (kcal/day). Fast days count as 0 kcal — see meanPlannedIntake. */
  intake_kcal: number
  /** Current trend weight (kg). */
  trend_kg: number
  /** Goal weight (kg), 65 for Aaron. */
  goal_kg: number
}

/** Structurally a `plan_versions.forecast` (finish_date, weekly_rate_kg, band, tdee_est) plus the band's dates. */
export type ForecastResult = {
  tdee_est: number
  intake_kcal: number
  /** kg lost per week; negative means gaining. */
  weekly_rate_kg: number
  /** The rate ±20 %: low = rate × 0.8, high = rate × 1.2. */
  band: { low: number; high: number }
  /** Weeks from as_of until the trend reaches the goal at the rate; null when the rate is not a loss. */
  weeks_to_goal: number | null
  finish_date: LocalDate | null
  /** Finish dates at the band's rates: early = at the high rate, late = at the low rate. */
  finish_band: { early: LocalDate | null; late: LocalDate | null }
}

/**
 *   weekly_rate = (tdee_est − intake_kcal) × 7 / 7,700
 *   band       = [weekly_rate × (1 − 0.20), weekly_rate × (1 + 0.20)]
 *   weeks      = (trend_kg − goal_kg) / weekly_rate            (0 when already at or under the goal)
 *   finish     = as_of + ⌈weeks × 7⌉ days                      (null when weekly_rate ≤ 0 and the goal is not reached,
 *                                                                 or when that is after 9999-12-31, the last LocalDate)
 */
export function forecast(input: ForecastInput): ForecastResult {
  const rate = ((input.tdee_est - input.intake_kcal) * 7) / KCAL_PER_KG
  const low = rate * (1 - FORECAST_BAND)
  const high = rate * (1 + FORECAST_BAND)
  const toGo = input.trend_kg - input.goal_kg

  const weeksAt = (r: number): number | null => (toGo <= 0 ? 0 : r > 0 ? toGo / r : null)
  const finishAt = (r: number): LocalDate | null => {
    const weeks = weeksAt(r)
    if (weeks === null) return null
    const days = Math.ceil(weeks * 7)
    return days <= daysBetween(input.as_of, LAST_DATE) ? addDays(input.as_of, days) : null
  }

  return {
    tdee_est: input.tdee_est,
    intake_kcal: input.intake_kcal,
    weekly_rate_kg: rate,
    band: { low, high },
    weeks_to_goal: weeksAt(rate),
    finish_date: finishAt(rate),
    finish_band: { early: finishAt(high), late: finishAt(low) },
  }
}

/** What `projectedOn` reads: the forecast's rate and finish, the goal, and the latest trend weight. */
export type ProjectionInput = {
  forecast: { weekly_rate_kg: number; finish_date: LocalDate | null } | null
  goal_kg: number
  /** The last day with a trend weight; a weight at or above it is already behind him. */
  trend: { date: LocalDate; kg: number } | null
}

/**
 * The day the forecast reaches `kg` — every projected date in the app (camps, milestones, the projected summit) sits
 * on this one line, so a camp's date and the summit's date always agree with the rate shown beside them:
 *   on(kg) = max(trend.date, finish_date − ⌈(kg − goal_kg) / weekly_rate_kg × 7⌉ days)
 * on(goal_kg) = finish_date. Null when the forecast is not a loss (weekly_rate_kg ≤ 0), has no finish date, kg is
 * under the goal, or the trend is already at or under kg.
 */
export function projectedOn(kg: number, input: ProjectionInput): LocalDate | null {
  const { forecast: f, goal_kg, trend } = input
  if (!f || !(f.weekly_rate_kg > 0) || f.finish_date === null || kg < goal_kg) return null
  if (trend && trend.kg <= kg) return null
  const on = addDays(f.finish_date, -Math.ceil(((kg - goal_kg) / f.weekly_rate_kg) * 7))
  return trend && on < trend.date ? trend.date : on
}
