// Owns: readiness (SPEC §7, §9) — a 0–100 score from last night's sleep, yesterday's steps against the 14-day median,
// and days since the last session; under 40 (or a night under 5 h) suggests reduced volume.
import { clamp, median, round } from './math'

/** Sleep that scores full marks (SPEC §9). */
export const SLEEP_GOAL_H = 7.5
/** Readiness below this suggests reduced volume (SPEC §9). */
export const READINESS_REDUCED_BELOW = 40
/** A night under this many hours suggests reduced volume whatever the score (SPEC §7 recovery rule). */
export const SHORT_SLEEP_H = 5

/** Structurally a `Readiness`. */
export type ReadinessScore = {
  score: number
  sleep_h: number | null
  steps_vs_median: number | null
  days_since_last_session: number | null
  reduced_volume: boolean
}

/**
 * Weighting (documented choice): sleep 0.5, yesterday's steps 0.2, days since the last session 0.3.
 *   sleep    = clamp((asleep_h − 3.5) / (7.5 − 3.5), 0, 1)              (3.5 h → 0, 7.5 h or more → 1)
 *   steps    = r = steps_yesterday / median(steps of the 14 days before); clamp(1 − (r − 1.25), 0, 1)
 *              (up to 1.25 × the median → 1, 2.25 × or more → 0: an unusually big day is fatigue)
 *   recovery = min(1, 0.4 + 0.3 × days_since_last_session)               (0 days → 0.4, 1 → 0.7, 2+ → 1)
 *   score    = round(100 × Σ wᵢ cᵢ / Σ wᵢ) over the components with data; 100 with no data at all
 *   reduced_volume = score < 40 ∨ asleep_h < 5
 */
export function readiness(input: {
  /** Last night's asleep minutes. */
  sleep_min: number | null
  steps_yesterday: number | null
  /** Daily steps of the 14 days before yesterday. */
  steps_prior_14d: readonly number[]
  /** Null when there is no session yet. */
  days_since_last_session: number | null
}): ReadinessScore {
  const sleep_h = input.sleep_min === null ? null : input.sleep_min / 60
  const med = median(input.steps_prior_14d)
  const steps_vs_median = input.steps_yesterday === null || med === null || med <= 0 ? null : input.steps_yesterday / med

  const parts: [weight: number, value: number][] = []
  if (sleep_h !== null) parts.push([0.5, clamp((sleep_h - 3.5) / (SLEEP_GOAL_H - 3.5), 0, 1)])
  if (steps_vs_median !== null) parts.push([0.2, clamp(1 - (steps_vs_median - 1.25), 0, 1)])
  if (input.days_since_last_session !== null) parts.push([0.3, clamp(0.4 + 0.3 * input.days_since_last_session, 0, 1)])

  const weights = parts.reduce((s, [w]) => s + w, 0)
  const score = weights === 0 ? 100 : Math.round((100 * parts.reduce((s, [w, v]) => s + w * v, 0)) / weights)
  return {
    score,
    sleep_h: sleep_h === null ? null : round(sleep_h, 2),
    steps_vs_median: steps_vs_median === null ? null : round(steps_vs_median, 2),
    days_since_last_session: input.days_since_last_session,
    reduced_volume: score < READINESS_REDUCED_BELOW || (sleep_h !== null && sleep_h < SHORT_SLEEP_H),
  }
}
