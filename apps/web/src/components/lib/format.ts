// Owns: how numbers and dates look everywhere in the UI (en-CA grouping, fixed precision, ISO dates per SPEC §2).

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

/** "2026-10-04" → "Oct 4" (axis ticks and compact labels; full ISO dates elsewhere). */
export function formatShortDate(date: string | number): string {
  return shortDate.format(typeof date === 'number' ? date : dateToTime(date))
}

/** "2026-10-04" → "Oct". */
export function formatMonth(date: string | number): string {
  return monthOnly.format(typeof date === 'number' ? date : dateToTime(date))
}

/** "2026-10-04" → "Sun". */
export function formatWeekday(date: string | number): string {
  return weekdayShort.format(typeof date === 'number' ? date : dateToTime(date))
}
