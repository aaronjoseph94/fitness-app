// Owns: local-date arithmetic in Aaron's timezone (America/Edmonton): the local date and time of an instant
// (DST-correct via Intl), day arithmetic on "YYYY-MM-DD", weekday keys, Monday week starts and ISO week keys.
import { Weekday, type IsoWeek, type LocalDate } from '../../schemas/common'

export const TIMEZONE = 'America/Edmonton'

const DAY_MS = 86_400_000
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const ISO_WEEK = /^(\d{4})-W(\d{2})$/

/** One formatter per isolate (constructing Intl formatters is the expensive part). h23 so midnight is "00", not "24". */
const edmonton = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** An instant: an ISO timestamp with offset ("…Z" or "…-06:00"), a Date, or epoch milliseconds. */
export type InstantInput = string | Date | number

function wallClock(instant: InstantInput): { date: LocalDate; time: string } {
  const at = instant instanceof Date ? instant : new Date(instant)
  if (Number.isNaN(at.getTime())) throw new RangeError(`Not an instant: ${String(instant)}`)
  const p: Record<string, string> = {}
  for (const { type, value } of edmonton.formatToParts(at)) p[type] = value
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

/** The Edmonton local date of an instant: wall-clock date in America/Edmonton (MST −07:00 / MDT −06:00 per Intl). */
export function localDate(instant: InstantInput): LocalDate {
  return wallClock(instant).date
}

/** Today in Edmonton for the given `now` (inject the clock; the engine never reads it). */
export function today(now: InstantInput): LocalDate {
  return wallClock(now).date
}

/** The Edmonton wall-clock time of an instant, "HH:MM" (00:00–23:59). The cron dispatches by this. */
export function localTime(instant: InstantInput): string {
  return wallClock(instant).time
}

/** "YYYY-MM-DD" → UTC midnight in ms (calendar arithmetic only; no timezone involved). */
function toUtcMs(date: LocalDate): number {
  const m = LOCAL_DATE.exec(date)
  if (!m) throw new RangeError(`Not a local date: ${date}`)
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function fromUtcMs(ms: number): LocalDate {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * The instant (epoch ms) `date` starts in Edmonton: UTC midnight + 6 h (MDT) or + 7 h (MST), whichever reads as that
 * date at 00:00. DST changes at 02:00, so local midnight always exists once.
 */
export function localMidnight(date: LocalDate): number {
  const utc = toUtcMs(date)
  for (const hours of [6, 7]) {
    const at = utc + hours * 3_600_000
    const wall = wallClock(at)
    if (wall.date === date && wall.time === '00:00') return at
  }
  return utc + 7 * 3_600_000
}

/** addDays(d, n) = the calendar date n days after d (n may be negative). */
export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS)
}

/** daysBetween(a, b) = b − a in whole calendar days (negative when b is before a). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS)
}

/** Weekday key of a date: mon … sun. Index = (getUTCDay() + 6) mod 7, so Monday = 0. */
export function weekdayOf(date: LocalDate): Weekday {
  return Weekday.options[(new Date(toUtcMs(date)).getUTCDay() + 6) % 7]!
}

/** The Monday on or before `date` (weeks run Monday–Sunday). */
export function weekStart(date: LocalDate): LocalDate {
  return addDays(date, -Weekday.options.indexOf(weekdayOf(date)))
}

/**
 * ISO 8601 week key "YYYY-Www": the week belongs to the year of its Thursday; week = ⌊(ordinal(Thursday) − 1) / 7⌋ + 1.
 */
export function isoWeek(date: LocalDate): IsoWeek {
  const thursday = addDays(weekStart(date), 3)
  const year = Number(thursday.slice(0, 4))
  const ordinal = daysBetween(`${year}-01-01`, thursday) + 1
  const week = Math.floor((ordinal - 1) / 7) + 1
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** Monday–Sunday of an ISO week key. Week 1 is the week containing 4 January. Throws on a week the year lacks. */
export function isoWeekRange(week: IsoWeek): { from: LocalDate; to: LocalDate } {
  const m = ISO_WEEK.exec(week)
  if (!m) throw new RangeError(`Not an ISO week: ${week}`)
  const from = addDays(weekStart(`${m[1]}-01-04`), (Number(m[2]) - 1) * 7)
  if (isoWeek(from) !== week) throw new RangeError(`No such ISO week: ${week}`)
  return { from, to: addDays(from, 6) }
}

/** Every date from `from` to `to`, inclusive, in order (empty when to < from). */
export function eachDate(from: LocalDate, to: LocalDate): LocalDate[] {
  const n = daysBetween(from, to)
  const out: LocalDate[] = []
  for (let i = 0; i <= n; i++) out.push(addDays(from, i))
  return out
}
