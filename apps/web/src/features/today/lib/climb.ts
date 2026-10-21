// Owns: the climb as Today's hero draws it (pure) — base camp (the profile's start weight), the summit (the goal), the
// camps between them (the weight milestones strictly between the two, heaviest first, each with the date it was
// reached or is forecast), the next camp still ahead with how much of the way to it is done, and the summit's date
// (the forecast's finish). Rates come from the Progress series (`effectiveRate`), so Today's dates match Progress.
import { addDays } from '@fitness/shared/engine'
import type { Forecast, LocalDate, Milestone } from '@fitness/shared/schemas'
import { effectiveRate } from '../../progress/series'

export interface Camp {
  kg: number
  /** The day it was reached, else the forecast day; null without a rate. */
  date: LocalDate | null
  reached: boolean
}

export interface NextCamp {
  kg: number
  date: LocalDate | null
  /** The summit itself when no camp is left before it. */
  summit: boolean
  /** Of the way from the last camp passed (or base camp) to this one: kg done and the stretch's whole length. */
  doneKg: number
  stretchKg: number
  /** Trend kg still to lose to reach it. */
  toGoKg: number
}

export interface Climb {
  startKg: number
  goalKg: number
  trendKg: number | null
  camps: Camp[]
  next: NextCamp | null
  /** The weekly loss the dates assume; null when the forecast is not a loss. */
  rateKg: number | null
  /** When the trend reaches the summit at that rate (the forecast's finish date). */
  finish: LocalDate | null
}

export interface ClimbInput {
  startKg: number
  goalKg: number
  milestones: readonly Milestone[]
  /** The last day with a trend weight, and that weight. */
  trend: { date: LocalDate; kg: number } | null
  forecast: Pick<Forecast, 'weekly_rate_kg' | 'finish_date'> | null
}

/** Date the trend reaches `kg` at `rate` kg/week: from.date + ⌈(from.kg − kg) / rate × 7⌉ days. */
function expectedOn(kg: number, from: { date: LocalDate; kg: number } | null, rate: number | null) {
  if (!from || rate === null || !(rate > 0) || kg >= from.kg) return null
  return addDays(from.date, Math.ceil(((from.kg - kg) / rate) * 7))
}

const round1 = (v: number) => Math.round(v * 10) / 10

/**
 * The climb from the profile, the milestones and the trend. A camp counts as passed when its milestone is reached or
 * the trend is at or under it; the next camp is the heaviest one not passed yet (the summit when none is left):
 *   doneKg = from − trend,  stretchKg = from − next,  toGoKg = trend − next
 * where `from` is the camp passed last (else base camp).
 */
export function climbOf({ startKg, goalKg, milestones, trend, forecast }: ClimbInput): Climb {
  const rateKg = trend && forecast ? effectiveRate(trend, forecast, goalKg) : null
  const trendKg = trend?.kg ?? null
  const camps: Camp[] = milestones
    .filter((m) => m.kind === 'weight' && m.target_value < startKg && m.target_value > goalKg)
    .sort((a, b) => b.target_value - a.target_value)
    .map((m) => {
      const reached = m.reached_on !== null || (trendKg !== null && trendKg <= m.target_value)
      return {
        kg: m.target_value,
        date: m.reached_on ?? (reached ? null : expectedOn(m.target_value, trend, rateKg)),
        reached,
      }
    })

  let next: NextCamp | null = null
  if (trendKg !== null && trendKg > goalKg) {
    const ahead = camps.find((c) => !c.reached)
    const from = camps.filter((c) => c.reached).at(-1)?.kg ?? startKg
    const kg = ahead?.kg ?? goalKg
    next = {
      kg,
      date: ahead ? ahead.date : (forecast?.finish_date ?? null),
      summit: !ahead,
      doneKg: round1(Math.max(0, from - trendKg)),
      stretchKg: round1(from - kg),
      toGoKg: round1(trendKg - kg),
    }
  }
  return { startKg, goalKg, trendKg, camps, next, rateKg, finish: forecast?.finish_date ?? null }
}
