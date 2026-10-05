// Owns: which day the Log tab shows for the URL (?date=, never after today). A second entry point of the log module:
// light, no UI.
import type { LocalDate } from '@fitness/shared/schemas'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** The day the Log tab shows for `?date=`: that date when it is valid and not after today, else today. */
export function logDate(raw: string | null, today: LocalDate): LocalDate {
  return raw && ISO_DATE.test(raw) && raw <= today ? raw : today
}
