// Owns: the planned fast as every Today / Dashboard / Progress view shows it (decision #8, as revised with fixer C) —
// read from the planned fast_logs rows (GET /api/fasts, so no view depends on daily_targets rows) and placed on its fast
// day: the engine's `fastDay`, the Edmonton date holding most of the fast (Sat for Fri 8 PM → Sat 8 PM), the same date
// that drives the 0 kcal target, `fast_dates` and /api/day. Its window reads as Log writes it (quick-log's
// `fastWindowLabel`: "Tonight 8:00 PM → Sat 8:00 PM").
import { fastDay, localDate } from '@fitness/shared/engine'
import type { Fast, LocalDate } from '@fitness/shared/schemas'

const HOUR_MS = 3_600_000
/** A planned fast past its start and not ended counts as under way for 2 × fast_hours; later it was missed. */
const RUNNING_WINDOW_FASTS = 2

export interface PlannedFast {
  id: string
  /** Its fast day (engine fastDay; its start date when it has none): where every view marks it. */
  day: LocalDate
  startedAt: string
  /** started_at + fast_hours (a planned fast has no end yet). */
  endsAt: string
}

/**
 * The planned fasts still to come or under way, soonest first:
 *   planned ∧ ended_at = null ∧ (started_at > now ∨ now − started_at < 2 × fast_hours)
 *   day = fastDay(fast, fast_hours) ?? localDate(started_at),  endsAt = started_at + fast_hours h
 */
export function plannedFasts(
  fasts: readonly Fast[] | undefined,
  nowMs: number,
  fastHours: number,
): PlannedFast[] {
  return (fasts ?? [])
    .filter((f) => {
      if (!f.planned || f.ended_at !== null) return false
      const start = Date.parse(f.started_at)
      return start > nowMs || nowMs - start < RUNNING_WINDOW_FASTS * fastHours * HOUR_MS
    })
    .map((f) => ({
      id: f.id,
      day: fastDay(f, fastHours) ?? localDate(f.started_at),
      startedAt: f.started_at,
      endsAt: new Date(Date.parse(f.started_at) + fastHours * HOUR_MS).toISOString(),
    }))
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1))
}
