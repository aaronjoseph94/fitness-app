// Owns: today's readiness for Today's session card (1d README §5.1: the readiness ring) — the engine's readiness()
// over last night's sleep (the day view), yesterday's steps against the 14 days before it (GET /api/days, the same
// window and cache as the Train tab's) and the days since the last session (GET /api/sessions, four weeks), plus the
// ring's colour band. The same inputs and bands as the Train tab's readiness chip, so the two never disagree.
import { addDays, daysBetween, readiness, type ReadinessScore } from '@fitness/shared/engine'
import type { DaySummary, LocalDate, SleepLog } from '@fitness/shared/schemas'
import { tokens } from '../../../theme'

/** Days of steps yesterday is compared against (SPEC §9: the 14-day median). */
const STEP_WINDOW_DAYS = 14
/** Readiness at or above this reads as good; under 40 suggests reduced volume (SPEC §9; Train's chip uses the same). */
const GOOD_FROM = 70
const REDUCED_BELOW = 40

/** Last night's minutes asleep: the logged value, else woke − in bed. */
function sleepMinutes(sleep: Pick<SleepLog, 'asleep_min' | 'in_bed_at' | 'woke_at'> | null): number | null {
  if (!sleep) return null
  if (sleep.asleep_min !== null && sleep.asleep_min !== undefined) return sleep.asleep_min
  return sleep.in_bed_at && sleep.woke_at
    ? Math.max(0, (Date.parse(sleep.woke_at) - Date.parse(sleep.in_bed_at)) / 60_000)
    : null
}

/**
 * readiness(sleep_min, steps_yesterday, steps of [yesterday − 14, yesterday), days since the last session on or before
 * `date`) — the engine's weighting (sleep 0.5, steps 0.2, recovery 0.3).
 */
export function readinessToday(input: {
  date: LocalDate
  sleep: SleepLog | null
  /** Day summaries covering yesterday and the 14 days before it. */
  days: readonly Pick<DaySummary, 'date' | 'steps'>[]
  /** Local dates of recent sessions (any order). */
  sessionDates: readonly LocalDate[]
}): ReadinessScore {
  const yesterday = addDays(input.date, -1)
  const from = addDays(yesterday, -STEP_WINDOW_DAYS)
  const prior = input.days
    .filter((d) => d.date >= from && d.date < yesterday)
    .flatMap((d) => (d.steps === null ? [] : [d.steps]))
  const last = input.sessionDates
    .filter((d) => d <= input.date)
    .sort()
    .at(-1)
  return readiness({
    sleep_min: sleepMinutes(input.sleep),
    steps_yesterday: input.days.find((d) => d.date === yesterday)?.steps ?? null,
    steps_prior_14d: prior,
    days_since_last_session: last ? daysBetween(last, input.date) : null,
  })
}

/** The ring's colour: teal from 70 (the mock's), amber from 40, red under it (reduced volume). */
export function readinessColor(score: number): string {
  return score < REDUCED_BELOW
    ? tokens.tone.danger.text
    : score < GOOD_FROM
      ? tokens.tone.warning.text
      : tokens.tone.success.solid
}
