// Owns: the next Evolt scan date the coach sets (schedule_scan, apply_review 'scan_date'). There is no table for it:
// the date is an ai_events 'note' with body { text, flag: 'scan_scheduled', scan_date } (null scan_date = cleared,
// back to the interval). The newest such note wins while its date is after the last confirmed scan; otherwise the
// next scan is the scans module's interval date (last confirmed scan + settings.scan_interval_days).
import { today } from '@fitness/shared/engine'
import { LocalDate } from '@fitness/shared/schemas'
import { and, desc, eq, sql } from 'drizzle-orm'
import * as z from 'zod'
import { ai_events } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { badRequest } from '../../../lib/http-error'
import { eventInsert } from '../../events'
import { scanSchedule } from '../../scans'
import type { NextScan, ScanScheduled } from './schemas'

const ScanScheduledBody = z.object({
  text: z.string(),
  flag: z.literal('scan_scheduled'),
  scan_date: LocalDate.nullable(),
})

/** The newest scheduled date (null when none was set or the last one was cleared). */
export async function scheduledScanDate(deps: Deps): Promise<string | null> {
  const [row] = await deps.db
    .select({ body: ai_events.body })
    .from(ai_events)
    .where(and(eq(ai_events.kind, 'note'), sql`json_extract(${ai_events.body}, '$.flag') = 'scan_scheduled'`))
    .orderBy(desc(ai_events.created_at), sql`rowid desc`)
    .limit(1)
  const parsed = ScanScheduledBody.safeParse(row?.body)
  return parsed.success ? parsed.data.scan_date : null
}

export async function nextScan(deps: Deps): Promise<NextScan> {
  const [schedule, scheduled] = await Promise.all([scanSchedule(deps), scheduledScanDate(deps)])
  const base = {
    last_scan_date: schedule.last_scan_date,
    interval_days: schedule.interval_days,
    interval_due: schedule.due,
  }
  if (scheduled && (!schedule.last_scan_date || scheduled > schedule.last_scan_date))
    return { ...base, date: scheduled, source: 'scheduled' }
  return { ...base, date: schedule.due, source: schedule.due ? 'interval' : 'none' }
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
  const body: z.infer<typeof ScanScheduledBody> = { text, flag: 'scan_scheduled', scan_date: date }
  await eventInsert(deps, { kind: 'note', summary: text, body, date: today(deps.now()) }).statement
  return { ...(await nextScan(deps)), previous_scheduled }
}
