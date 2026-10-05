// Owns: trend weight — the EWMA of daily weigh-ins (SPEC §9) and the change of the trend over N days.
import type { LocalDate } from '../../schemas/common'
import { addDays, eachDate } from './dates'

/** Smoothing factor of the trend (SPEC §9). */
export const TREND_ALPHA = 0.25

/** One day of the trend series: the raw weigh-in (null on a missed day) and the trend weight (structurally a `TrendPoint`). */
export type TrendDay = { date: LocalDate; weight_kg: number | null; trend_kg: number }

/**
 * Trend weight per day.
 *   trend₀ = raw₀ (the first weigh-in seeds the trend)
 *   trendₜ = trendₜ₋₁ + α × (rawₜ − trendₜ₋₁), α = 0.25, on a day with a weigh-in
 *   trendₜ = trendₜ₋₁ on a day without one (gaps carry the trend forward, no update)
 * Pass every weigh-in up to `to` (the trend depends on all history). The series runs from max(range.from, first
 * weigh-in) to range.to (default: the last weigh-in); days before the first weigh-in have no trend and are omitted.
 * Several weigh-ins on one date: the last one in input order wins.
 */
export function trendWeights(
  weighIns: readonly { date: LocalDate; weight_kg: number }[],
  range: { from?: LocalDate; to?: LocalDate } = {},
): TrendDay[] {
  const byDate = new Map<LocalDate, number>()
  for (const w of weighIns) byDate.set(w.date, w.weight_kg)
  if (byDate.size === 0) return []
  const dates = [...byDate.keys()].sort()
  const first = dates[0]!
  const to = range.to ?? dates[dates.length - 1]!
  const out: TrendDay[] = []
  let trend: number | null = null
  for (const date of eachDate(first, to)) {
    const raw = byDate.get(date) ?? null
    if (raw !== null) trend = trend === null ? raw : trend + TREND_ALPHA * (raw - trend)
    if (trend !== null && (range.from === undefined || date >= range.from)) out.push({ date, weight_kg: raw, trend_kg: trend })
  }
  return out
}

/** Anything with a date and a trend weight: a TrendDay, or a v_day row with its trend merged in. */
export type TrendSample = { date: LocalDate; trend_kg: number | null }

/** The trend weight on `date`, or null when the series does not cover it. */
export function trendOn(series: readonly TrendSample[], date: LocalDate): number | null {
  for (const p of series) if (p.date === date) return p.trend_kg
  return null
}

/** Change of the trend over `days` days ending on `date`: trend(date) − trend(date − days). Null without both ends. */
export function trendChange(series: readonly TrendSample[], date: LocalDate, days = 7): number | null {
  const end = trendOn(series, date)
  const start = trendOn(series, addDays(date, -days))
  return end === null || start === null ? null : end - start
}
