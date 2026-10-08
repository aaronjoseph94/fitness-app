// Owns: how numbers, dates and times look everywhere in the UI (en-CA grouping, fixed precision, ISO dates per SPEC §2,
// and the 12-hour Edmonton clock: "2:02 PM").
import { localDate, TIMEZONE, today } from '@fitness/shared/engine'

const formatters = new Map<string, Intl.NumberFormat>()

function numberFormat(precision: number, compact: boolean): Intl.NumberFormat {
  const key = `${precision}:${compact}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat('en-CA', {
      minimumFractionDigits: compact ? 0 : precision,
      maximumFractionDigits: precision,
      ...(compact ? { notation: 'compact' as const } : {}),
    })
    formatters.set(key, f)
  }
  return f
}

/** 1400 → "1,400"; (91.43, 1) → "91.4"; null → "—". `compact` gives 12.9K style for axis ticks. */
export function formatNumber(value: number | null | undefined, precision = 0, compact = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return numberFormat(precision, compact).format(value)
}

/** Signed delta: (-3.72, 1) → "−3.7", (0.4, 1) → "+0.4". Uses a true minus sign. */
export function formatSigned(value: number, precision = 0): string {
  const abs = formatNumber(Math.abs(value), precision)
  if (Number(abs.replace(/,/g, '')) === 0) return abs
  return `${value < 0 ? '−' : '+'}${abs}`
}

/** Local date "2026-10-04" → UTC midnight timestamp, so date maths never shifts by a timezone. */
export function dateToTime(date: string): number {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number)
  return Date.UTC(y!, (m ?? 1) - 1, d ?? 1)
}

/** Timestamp from dateToTime → "2026-10-04". */
export function timeToDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}

const shortDate = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const monthOnly = new Intl.DateTimeFormat('en-CA', { month: 'short', timeZone: 'UTC' })
const weekdayShort = new Intl.DateTimeFormat('en-CA', { weekday: 'short', timeZone: 'UTC' })
const longDate = new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })

/** "2026-10-04" → "Oct 4" (axis ticks and compact labels; full ISO dates elsewhere). */
export function formatShortDate(date: string | number): string {
  return shortDate.format(typeof date === 'number' ? date : dateToTime(date))
}

/** ("2026-10-05", "2026-10-11") → "Oct 5 – 11"; across a month end → "Sep 28 – Oct 4". */
export function formatDayRange(from: string, to: string): string {
  const end = from.slice(0, 7) === to.slice(0, 7) ? String(Number(to.slice(8, 10))) : formatShortDate(to)
  return `${formatShortDate(from)} – ${end}`
}

/** "2026-10-04" → "Oct". */
export function formatMonth(date: string | number): string {
  return monthOnly.format(typeof date === 'number' ? date : dateToTime(date))
}

/** "2026-10-04" → "Sun". */
export function formatWeekday(date: string | number): string {
  return weekdayShort.format(typeof date === 'number' ? date : dateToTime(date))
}

/** "2026-10-04" → "Sunday, October 4". Used by the greeting hero, so the whole title reads as one line. */
export function formatLongDate(date: string | number): string {
  return longDate.format(typeof date === 'number' ? date : dateToTime(date))
}

// en-US, not en-CA: en-CA writes "p.m.".
const clock = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, hour: 'numeric', minute: '2-digit' })
const weekdayClock = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, weekday: 'short', hour: 'numeric', minute: '2-digit' })

/** "2026-10-07T20:02:00Z" → "2:02 PM" (Edmonton). */
export function formatClock(instant: string): string {
  return clock.format(new Date(instant))
}

/** "2:02 PM" when the instant is from today (Edmonton), else "Tue 4:31 PM". */
export function formatRecentTime(instant: string, now: number = Date.now()): string {
  return localDate(instant) === today(now) ? formatClock(instant) : weekdayClock.format(new Date(instant)).replace(',', '')
}

/** A stored Edmonton time "16:30" → "4:30 PM". */
export function formatClockTime(time: string): string {
  const [h = 0, m = 0] = time.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
