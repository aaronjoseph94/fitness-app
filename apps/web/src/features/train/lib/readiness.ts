// Owns: today's readiness on the Train tab before a session starts — the engine's readiness() over the day view's
// sleep, the days list's steps (yesterday vs the 14 days before it) and the sessions list (days since the last one).
// Once a session starts, the Worker's readiness stored on it is shown instead.
import { addDays, daysBetween, readiness, type ReadinessScore } from '@fitness/shared/engine'
import type { DaySummary } from '@fitness/shared/schemas'

/** Days of steps the readiness compares yesterday against (SPEC §9: the 14-day median). */
export const STEP_WINDOW_DAYS = 14

export function readinessToday(input: {
  date: string
  /** Last night's asleep minutes (the day view's sleep log). */
  sleep_min: number | null
  /** Day summaries covering yesterday and the 14 days before it. */
  days: readonly Pick<DaySummary, 'date' | 'steps'>[]
  /** Local dates of sessions (any order). */
  session_dates: readonly string[]
}): ReadinessScore {
  const yesterday = addDays(input.date, -1)
  const from = addDays(yesterday, -STEP_WINDOW_DAYS)
  const prior = input.days
    .filter((d) => d.date >= from && d.date < yesterday)
    .flatMap((d) => (d.steps === null ? [] : [d.steps]))
  // As the Worker counts it at session start: any session on or before today.
  const last = input.session_dates
    .filter((d) => d <= input.date)
    .sort()
    .at(-1)
  return readiness({
    sleep_min: input.sleep_min,
    steps_yesterday: input.days.find((d) => d.date === yesterday)?.steps ?? null,
    steps_prior_14d: prior,
    days_since_last_session: last ? daysBetween(last, input.date) : null,
  })
}
