// Owns: the logging forms' clock in Aaron's timezone (America/Edmonton): today's local date, the local date and wall time
// of an instant, an Edmonton wall-clock time as a UTC instant, day shifts, and how dates and durations read on screen.
// Small and local on purpose; swap for the engine's dates helpers once @fitness/shared/engine exports them.

const TIMEZONE = 'America/Edmonton'
const DAY_MS = 86_400_000

const wallFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

type InstantLike = string | number | Date

interface Wall {
  date: string
  time: string
  /** The wall-clock reading as if it were UTC, in ms (for offset maths). */
  asUtc: number
}

function wall(instant: InstantLike): Wall {
  const at = instant instanceof Date ? instant : new Date(instant)
  const p: Record<string, string> = {}
  for (const { type, value } of wallFormat.formatToParts(at)) p[type] = value
  const [y, mo, d, h, mi, s] = [p.year, p.month, p.day, p.hour, p.minute, p.second].map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    asUtc: Date.UTC(y, mo - 1, d, h, mi, s),
  }
}

/** Today's Edmonton date, "2026-10-05". */
export function todayLocal(now: InstantLike = Date.now()): string {
  return wall(now).date
}

/** The Edmonton date of an instant. */
export function dateOf(instant: InstantLike): string {
  return wall(instant).date
}

/** The Edmonton wall time of an instant, "07:42". */
export function clockOf(instant: InstantLike): string {
  return wall(instant).time
}

/** The date `days` calendar days after `date` (negative goes back). */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Whole calendar days from `a` to `b`. */
export function daysBetween(a: string, b: string): number {
  const ms = (date: string) => {
    const [y, m, d] = date.split('-').map(Number) as [number, number, number]
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((ms(b) - ms(a)) / DAY_MS)
}

/**
 * An Edmonton wall-clock date and time ("2026-10-04", "19:00") as a UTC instant string. Offset = wall(t) − t, found at
 * a first guess and re-checked once at the result, so DST changeover days land on the right side.
 */
export function instantAt(date: string, time: string): string {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number]
  const [h, mi] = time.split(':').map(Number) as [number, number]
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const offsetAt = (t: number) => wall(t).asUtc - Math.floor(t / 1000) * 1000
  const first = offsetAt(guess)
  let at = guess - first
  const second = offsetAt(at)
  if (second !== first) at = guess - second
  return new Date(at).toISOString()
}

/** An instant on `date` at the current wall time (today: now). Used when logging to a day other than today. */
export function instantOnDate(date: string, now: InstantLike = Date.now()): string {
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
export function formatDateTime(instant: InstantLike): string {
  const w = wall(instant)
  return `${w.date} ${w.time}`
}
