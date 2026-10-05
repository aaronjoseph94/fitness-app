// Owns: the next Evolt scan date the coach sets (schedule_scan, apply_review 'scan_date'). There is no table for it:
// the date is an ai_events 'note' with body { text, flag: 'scan_scheduled', scan_date } (null scan_date = cleared,
// back to the interval). The scans module's scanSchedule reads it back (the newest such note since the last confirmed
// scan, for a date after it), so the reminder, the nightly due note and next_scan all agree.
import { today } from '@fitness/shared/engine'
import type { Deps } from '../../../lib/deps'
import { badRequest } from '../../../lib/http-error'
import { eventInsert } from '../../events'
import { scanSchedule, type ScanScheduledNoteBody } from '../../scans'
import type { NextScan, ScanScheduled } from './schemas'

/** The scheduled date in force (null when none was set since the last scan, or it was cleared). */
export async function scheduledScanDate(deps: Deps): Promise<string | null> {
  return (await scanSchedule(deps)).scheduled
}

export async function nextScan(deps: Deps): Promise<NextScan> {
  const schedule = await scanSchedule(deps)
  return {
    last_scan_date: schedule.last_scan_date,
    interval_days: schedule.interval_days,
    interval_due: schedule.interval_due,
    date: schedule.due,
    source: schedule.source,
  }
}

/** Record the next scan date (today or later), or clear it with null (back to the interval). */
export async function scheduleScan(deps: Deps, date: string | null): Promise<ScanScheduled> {
  if (date !== null && date < today(deps.now()))
    throw badRequest(`A scan date must be today or later (got ${date})`)
  const previous_scheduled = await scheduledScanDate(deps)
  const text =
    date === null
      ? 'Next Evolt scan back on the usual interval'
      : `Evolt scan planned for ${date}. Same conditions as the baseline: morning, fasted, no training the day before.`
  const body: ScanScheduledNoteBody = { text, flag: 'scan_scheduled', scan_date: date }
  await eventInsert(deps, { kind: 'note', summary: text, body, date: today(deps.now()) }).statement
  return { ...(await nextScan(deps)), previous_scheduled }
}
