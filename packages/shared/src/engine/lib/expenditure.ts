// Owns: the adaptive expenditure estimate (tdee_est, SPEC §9) from logged intake and the change of the trend weight.
import type { LocalDate } from '../../schemas/common'
import { addDays } from './dates'
import { KCAL_PER_KG } from './forecast'
import { clamp, mean, round } from './math'
import { trendOn } from './trend'
import type { DayRow } from './types'

/** Trailing window of the estimate (SPEC §9). */
export const EXPENDITURE_WINDOW_DAYS = 14
/** Logged intake days the window needs before the estimate moves (SPEC §9). */
export const MIN_LOGGED_DAYS = 10
/** Plausible range of the estimate (SPEC §9). */
export const TDEE_RANGE = { min: 1200, max: 4500 } as const

/** A v_day row as the estimate reads it. */
export type ExpenditureDay = Pick<DayRow, 'date' | 'trend_kg' | 'meals_logged' | 'is_fast_day'> & { intake: { kcal: number } }

export type ExpenditureEstimate = {
  /** The new estimate (kcal/day, whole) — the previous one when the window is not usable. */
  tdee_est: number
  /** The unclamped, unsmoothed window value; null when the window is not usable. */
  raw_kcal: number | null
  days_logged: number
  updated: boolean
}

/**
 * Over the 14 days as_of − 13 … as_of (call it weekly, on a complete day such as yesterday):
 *   logged day   = meals_logged > 0 ∨ is_fast_day   (a fast day is a logged day at its intake, 0 kcal when nothing eaten)
 *   mean_intake  = Σ intake.kcal over logged days / logged days
 *   raw          = mean_intake + (trend(as_of − 14) − trend(as_of)) × 7,700 / 14
 *   tdee_est     = round(0.5 × clamp(raw, 1,200, 4,500) + 0.5 × previous_kcal)
 * With fewer than 10 logged days, or no trend at either end, tdee_est = previous_kcal (not updated).
 * Start: previous_kcal = the scan TEE (2,551 kcal) until there is an estimate.
 */
export function estimateExpenditure(input: { as_of: LocalDate; days: readonly ExpenditureDay[]; previous_kcal: number }): ExpenditureEstimate {
  const from = addDays(input.as_of, -(EXPENDITURE_WINDOW_DAYS - 1))
  const logged = input.days.filter((d) => d.date >= from && d.date <= input.as_of && (d.meals_logged > 0 || d.is_fast_day))
  const start = trendOn(input.days, addDays(input.as_of, -EXPENDITURE_WINDOW_DAYS))
  const end = trendOn(input.days, input.as_of)
  const intake = mean(logged.map((d) => d.intake.kcal))
  if (logged.length < MIN_LOGGED_DAYS || start === null || end === null || intake === null)
    return { tdee_est: input.previous_kcal, raw_kcal: null, days_logged: logged.length, updated: false }

  const raw = intake + ((start - end) * KCAL_PER_KG) / EXPENDITURE_WINDOW_DAYS
  const tdee = round(0.5 * clamp(raw, TDEE_RANGE.min, TDEE_RANGE.max) + 0.5 * input.previous_kcal)
  return { tdee_est: tdee, raw_kcal: raw, days_logged: logged.length, updated: true }
}
