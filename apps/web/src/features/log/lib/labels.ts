// Owns: how the Log tab words its days (2a) — the date switcher's day names ("Wed, Oct 7", "Tue 6") and a fast's day
// ("Saturday, Oct 10"). Pure. Times use the kit's `formatClock`.
import { dateToTime, formatShortDate, formatWeekday } from '../../../components'

const longWeekdayDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' })

/** "2026-10-07" → "Wed, Oct 7". */
export function dayLabel(date: string): string {
  return `${formatWeekday(date)}, ${formatShortDate(date)}`
}

/** "2026-10-06" → "Tue 6". */
export function shortDayLabel(date: string): string {
  return `${weekday.format(dateToTime(date))} ${Number(date.slice(8, 10))}`
}

/** "2026-10-10" → "Saturday, Oct 10". */
export function longDayLabel(date: string): string {
  return longWeekdayDate.format(dateToTime(date))
}
