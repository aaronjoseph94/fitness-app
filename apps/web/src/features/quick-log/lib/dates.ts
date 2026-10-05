// Owns: the logging forms' clock in Aaron's timezone (America/Edmonton). Today's local date, the local date and wall
// time of an instant, day shifts and day counts are the engine's dates helpers under the names the logging kit uses;
// this file adds an Edmonton wall-clock time as a UTC instant, and how dates and durations read on screen.
import { addDays, daysBetween, localDate, localTime, today, type InstantInput } from '@fitness/shared/engine'

export { daysBetween }

/** Today's Edmonton date, "2026-10-05". */
export function todayLocal(now: InstantInput = Date.now()): string {
  return today(now)
}

/** The Edmonton date of an instant. */
export const dateOf = localDate

/** The Edmonton wall time of an instant, "07:42". */
export const clockOf = localTime

/** The date `days` calendar days after `date` (negative goes back). */
export const shiftDate = addDays

/** The Edmonton wall clock of an instant read as if it were UTC, in ms at minute resolution (for offset maths). */
function wallAsUtc(t: number): number {
  const [y, mo, d] = localDate(t).split('-').map(Number) as [number, number, number]
  const [h, mi] = localTime(t).split(':').map(Number) as [number, number]
  return Date.UTC(y, mo - 1, d, h, mi)
}

/**
 * An Edmonton wall-clock date and time ("2026-10-04", "19:00") as a UTC instant string. Offset = wall(t) − t, found at
 * a first guess and re-checked once at the result, so DST changeover days land on the right side.
 */
export function instantAt(date: string, time: string): string {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number]
  const [h, mi] = time.split(':').map(Number) as [number, number]
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const offsetAt = (t: number) => wallAsUtc(t) - Math.floor(t / 60_000) * 60_000
  const first = offsetAt(guess)
  let at = guess - first
  const second = offsetAt(at)
  if (second !== first) at = guess - second
  return new Date(at).toISOString()
}

/** An instant on `date` at the current wall time (today: now). Used when logging to a day other than today. */
export function instantOnDate(date: string, now: InstantInput = Date.now()): string {
  if (date === todayLocal(now)) return new Date(now).toISOString()
  return instantAt(date, clockOf(now))
}

/** "Today", "Yesterday", "Tomorrow", else the weekday: "Fri". Pair it with the ISO date. */
export function relativeDay(date: string, today = todayLocal()): string {
  const delta = daysBetween(today, date)
  if (delta === 0) return 'Today'
  if (delta === -1) return 'Yesterday'
  if (delta === 1) return 'Tomorrow'
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Intl.DateTimeFormat('en-CA', { weekday: 'short', timeZone: 'UTC' }).format(Date.UTC(y, m - 1, d))
}

/** Milliseconds → "18 h 12 min" (or "42 min"). */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000))
  const h = Math.floor(totalMin / 60)
  const min = totalMin % 60
  if (h === 0) return `${min} min`
  return min === 0 ? `${h} h` : `${h} h ${min} min`
}

/** "2026-10-04 19:00" in Edmonton time. */
export function formatDateTime(instant: InstantInput): string {
  return `${localDate(instant)} ${localTime(instant)}`
}
