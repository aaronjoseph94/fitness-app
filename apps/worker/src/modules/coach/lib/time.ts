// Owns: the two wall-clock rules the coach and the tools share — an Edmonton date + time as a UTC instant, and which
// Monday–Sunday week a review run "now" is about.
import { addDays, localDate, localTime, today, weekdayOf, weekStart } from '@fitness/shared/engine'

/**
 * The UTC instant of `date` at `time` (HH:MM) on Edmonton wall clocks: try MDT (−06:00), then MST (−07:00), keeping the
 * one whose Edmonton date and time read back as asked. In the spring-forward gap (02:00–03:00) neither does; the MST
 * reading (an hour later on the clock) is used.
 */
export function localInstant(date: string, time = '00:00'): string {
  for (const offset of ['-06:00', '-07:00']) {
    const iso = new Date(`${date}T${time}:00${offset}`).toISOString()
    if (localDate(iso) === date && localTime(iso) === time) return iso
  }
  return new Date(`${date}T${time}:00-07:00`).toISOString()
}

/** The Monday of the week a review run now covers: Saturday or Sunday → this week; Monday–Friday → last week. */
export function reviewWeekStart(now: Date): string {
  const d = today(now)
  const wd = weekdayOf(d)
  return wd === 'sat' || wd === 'sun' ? weekStart(d) : weekStart(addDays(d, -7))
}
