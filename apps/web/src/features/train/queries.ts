// Owns: the inputs and freshness of the Train tab's reads (four weeks of sessions, the steps window readiness needs,
// the templates), shared by useTrainData and useTemplates. A second entry point of the train module: light, no UI.
import { addDays } from '@fitness/shared/engine'
import type { LocalDate } from '@fitness/shared/schemas'
import { STEP_WINDOW_DAYS } from './lib/readiness'

/** Recent sessions shown and read: four weeks. */
export const RECENT_DAYS = 28

/** GET /api/sessions for the recent list: the RECENT_DAYS days ending on `date`. */
export const recentSessionsInput = (date: LocalDate) => ({ query: { from: addDays(date, -(RECENT_DAYS - 1)), to: date } })

/** GET /api/days for readiness: the steps window before `date` (not including it). */
export const stepsWindowInput = (date: LocalDate) => ({
  query: { from: addDays(date, -(STEP_WINDOW_DAYS + 1)), to: addDays(date, -1) },
})

/** Templates change only from the builder (which marks them stale). */
export const TEMPLATES_STALE_MS = 5 * 60_000
