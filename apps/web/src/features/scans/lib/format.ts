// Owns: how the scan pages write dates and conditions — "Sep 26, 2026", "Sat, Nov 7", and a scan's conditions as one
// short line ("Morning · fasted · baseline").
import type { ScanConditions } from '@fitness/shared/schemas'
import { formatShortDate, formatWeekday } from '../../../components'

/** "2026-09-26" → "Sep 26, 2026". */
export function scanDay(date: string): string {
  return `${formatShortDate(date)}, ${date.slice(0, 4)}`
}

/** "2026-11-07" → "Sat, Nov 7". */
export function weekdayDay(date: string): string {
  return `${formatWeekday(date)}, ${formatShortDate(date)}`
}

/** "Morning · fasted · baseline": the time of day, fasted when said, and how it compares with the baseline. */
export function conditionsLine(c: ScanConditions, isBaseline: boolean): string {
  return [
    c.time_of_day[0]!.toUpperCase() + c.time_of_day.slice(1),
    c.fasted === true ? 'fasted' : c.fasted === false ? 'not fasted' : null,
    isBaseline ? 'baseline' : c.matches_baseline === false ? 'not baseline conditions' : null,
  ]
    .filter((x): x is string => x !== null)
    .join(' · ')
}
