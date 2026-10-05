// Owns: mapping fast_logs rows to the Fast contract shape, and the calendar month bounds a fast is counted in.
import { addDays } from '@fitness/shared/engine'
import type { Fast } from '@fitness/shared/schemas'
import type { fast_logs, Row } from '../../../db'

export const toFast = (r: Row<typeof fast_logs>): Fast => ({
  id: r.id,
  started_at: r.started_at,
  ended_at: r.ended_at,
  planned: r.planned,
  note: r.note,
  created_at: r.created_at,
  updated_at: r.updated_at,
})

/** The local month of `date` as a half-open range [first day, first day of next month). */
export function monthOf(date: string): { from: string; until: string } {
  const from = `${date.slice(0, 7)}-01`
  const until = `${addDays(`${date.slice(0, 7)}-28`, 4).slice(0, 7)}-01`
  return { from, until }
}
