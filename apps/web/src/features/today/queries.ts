// Owns: the inputs and freshness of Today's reads (the hero chart's trend window, settings), shared by useTodayData.
// A second entry point of the today module: light, no UI.
import { addDays } from '@fitness/shared/engine'
import type { LocalDate } from '@fitness/shared/schemas'

/** The hero chart's history: about eight weeks. */
export const HERO_DAYS = 56

/** GET /api/trend for the hero chart: the HERO_DAYS days ending on `date`. */
export const heroTrendInput = (date: LocalDate) => ({ query: { from: addDays(date, -(HERO_DAYS - 1)), to: date } })

/** Settings change only from the Settings page (which marks them stale). */
export const SETTINGS_STALE_MS = 5 * 60_000
