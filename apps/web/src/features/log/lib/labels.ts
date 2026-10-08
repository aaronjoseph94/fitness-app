// Owns: how the Log tab words its times and days (2a) — a 12-hour Edmonton clock ("7:40 AM"), the date switcher's day
// names ("Wed, Oct 7", "Tue 6") and a fast's day ("Saturday, Oct 10"). Pure.
import { TIMEZONE } from '@fitness/shared/engine'
import { dateToTime } from '../../../components'

const clock = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, hour: 'numeric', minute: '2-digit' })
const weekdayDate = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
const longWeekdayDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' })

/** "2026-10-07T13:40:00Z" → "7:40 AM" (Edmonton). */
export function clock12(instant: string): string {
  return clock.format(new Date(instant))
}

/** "2026-10-07" → "Wed, Oct 7". */
export function dayLabel(date: string): string {
  return weekdayDate.format(dateToTime(date))
}

/** "2026-10-06" → "Tue 6". */
export function shortDayLabel(date: string): string {
  return `${weekday.format(dateToTime(date))} ${Number(date.slice(8, 10))}`
}

/** "2026-10-10" → "Saturday, Oct 10". */
export function longDayLabel(date: string): string {
  return longWeekdayDate.format(dateToTime(date))
}
