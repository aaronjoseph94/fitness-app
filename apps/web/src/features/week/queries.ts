// Owns: the week view read's input and freshness (GET /api/week-plans/view), shared by useWeekPlan. A second entry
// point of the week module: light, no UI.
import { weekStart } from '@fitness/shared/engine'
import type { LocalDate } from '@fitness/shared/schemas'

/** GET /api/week-plans/view for the week holding `date`. */
export const weekViewInput = (date: LocalDate) => ({ query: { week_start: weekStart(date) } })

/** The week view changes only through accept / revert (which mark it stale): a minute between reads. */
export const WEEK_VIEW_STALE_MS = 60_000
