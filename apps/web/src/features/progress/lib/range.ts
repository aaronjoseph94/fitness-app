// Owns: the Progress range selector's model — the three ranges (4 w, 12 w, all) and the dates each covers, counted back
// from the local date (app/local-today).
import { addDays, daysBetween } from '@fitness/shared/engine'
import type { LocalDate } from '@fitness/shared/schemas'

export type RangeKey = '4w' | '12w' | 'all'

export const RANGES: readonly { key: RangeKey; label: string; days: number | null }[] = [
  { key: '4w', label: '4 w', days: 28 },
  { key: '12w', label: '12 w', days: 84 },
  { key: 'all', label: 'All', days: null },
]

export function isRangeKey(value: string | null): value is RangeKey {
  return RANGES.some((r) => r.key === value)
}

/** GET /api/days takes at most 400 days (DaysQuery). */
const MAX_DAYS = 400
/** "All" before the profile has loaded, or without a start date. */
const FALLBACK_ALL_DAYS = 365

/**
 * The dates a range covers, ending today: 4 w = 28 days, 12 w = 84 days, all = at most 400 days. No range starts
 * before the profile's start date (nothing is logged before it), but every range shows at least 7 days.
 */
export function rangeDates(key: RangeKey, date: LocalDate, startDate: LocalDate | null): { from: LocalDate; to: LocalDate } {
  const wanted = RANGES.find((r) => r.key === key)?.days ?? FALLBACK_ALL_DAYS
  const sinceStart = startDate && startDate <= date ? daysBetween(startDate, date) + 1 : Infinity
  const days = Math.max(7, Math.min(MAX_DAYS, key === 'all' && sinceStart !== Infinity ? sinceStart : Math.min(wanted, sinceStart)))
  return { from: addDays(date, -(days - 1)), to: date }
}
