// Owns: when the next scan is due (SPEC §3, §8) — the date the coach or an applied week plan scheduled (an ai_events
// 'scan_scheduled' note written on or after the last confirmed scan's date, for a date after it; the newest such note
// wins, and a null scan_date clears it; scanDateNote builds that note for the caller's batch), else every
// settings.scan_interval_days (default 28) after the last confirmed scan — and the nightly "scan due" note: once on
// the due date, then weekly while overdue, never while a newer sheet waits to be confirmed.
import { addDays, today } from '@fitness/shared/engine'
import { LocalDate, type ScanSchedule } from '@fitness/shared/schemas'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import * as z from 'zod'
import { ai_events, scans, settings } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { eventInsert } from '../../events'
import { ScanDueNoteBody } from './note'

/** A due note is repeated at most this often while the scan is overdue. */
const REPEAT_DAYS = 7

/** Body of the note that sets (or, with null, clears) the next scan date (the coach's schedule_scan writes it). */
export const ScanScheduledNoteBody = z.object({ text: z.string(), flag: z.literal('scan_scheduled'), scan_date: LocalDate.nullable() })
export type ScanScheduledNoteBody = z.infer<typeof ScanScheduledNoteBody>

/**
 * The note that sets the next scan date (or, with null, clears it back to the interval), dated today, as a statement
 * for the caller's db.batch. The caller checks the date is today or later.
 */
export function scanDateNote(deps: Deps, date: LocalDate | null) {
  const text =
    date === null
      ? 'Next Evolt scan back on the usual interval'
      : `Evolt scan planned for ${date}. Same conditions as the baseline: morning, fasted, no training the day before.`
  const body: ScanScheduledNoteBody = { text, flag: 'scan_scheduled', scan_date: date }
  return eventInsert(deps, { kind: 'note', summary: text, body, date: today(deps.now()) }).statement
}

/** The newest scan_scheduled note written on or after the last confirmed scan's date (indexed by date). */
const scheduleNotes = (deps: Deps) =>
  deps.db
    .select({ body: ai_events.body })
    .from(ai_events)
    .where(
      and(
        gte(
          ai_events.date,
          sql`coalesce((select ${scans.date} from ${scans} where ${scans.confirmed} = 1 order by ${scans.scanned_at} desc limit 1), '0000-01-01')`,
        ),
        eq(ai_events.kind, 'note'),
        sql`json_extract(${ai_events.body}, '$.flag') = 'scan_scheduled'`,
      ),
    )
    .orderBy(desc(ai_events.created_at), sql`rowid desc`)
    .limit(1)

export async function scanSchedule(deps: Deps): Promise<ScanSchedule> {
  const { db } = deps
  const [[s], [last], [waiting], [note]] = await db.batch([
    db.select({ interval: settings.scan_interval_days }).from(settings).limit(1),
    db.select({ date: scans.date }).from(scans).where(eq(scans.confirmed, true)).orderBy(desc(scans.scanned_at)).limit(1),
    db.select({ date: scans.date }).from(scans).where(eq(scans.confirmed, false)).orderBy(desc(scans.scanned_at)).limit(1),
    scheduleNotes(deps),
  ])
  const interval_days = s?.interval ?? 28
  const last_scan_date = last?.date ?? null
  const interval_due = last_scan_date ? addDays(last_scan_date, interval_days) : null
  const set = ScanScheduledNoteBody.safeParse(note?.body)
  const scheduled = set.success && set.data.scan_date && (!last_scan_date || set.data.scan_date > last_scan_date) ? set.data.scan_date : null
  return {
    last_scan_date,
    interval_days,
    interval_due,
    scheduled,
    due: scheduled ?? interval_due,
    source: scheduled ? 'scheduled' : interval_due ? 'interval' : 'none',
    awaiting_confirmation: waiting && (!last_scan_date || waiting.date >= last_scan_date) ? waiting.date : null,
  }
}

/**
 * Nightly: record a "scan due" note (actor ai, date = `date`) when due ≤ date, unless one was noted in the last 7 days
 * (or since the due date) or a sheet uploaded on/after the due date is waiting to be confirmed. Idempotent per day.
 */
export async function noteScanDue(deps: Deps, date: LocalDate): Promise<{ due: LocalDate | null; noted: boolean }> {
  const schedule = await scanSchedule(deps)
  const { due } = schedule
  if (!due || due > date) return { due, noted: false }
  if (schedule.awaiting_confirmation && schedule.awaiting_confirmation >= due) return { due, noted: false }
  const since = [due, addDays(date, -(REPEAT_DAYS - 1))].sort().at(-1)!
  const recent = await deps.db
    .select({ body: ai_events.body })
    .from(ai_events)
    .where(and(eq(ai_events.kind, 'note'), gte(ai_events.date, since)))
  if (recent.some((r) => ScanDueNoteBody.safeParse(r.body).success)) return { due, noted: false }
  const why = schedule.source === 'scheduled' ? `planned; last ${schedule.last_scan_date ?? 'none'}` : `last ${schedule.last_scan_date}, every ${schedule.interval_days} days`
  const text =
    due === date
      ? `Evolt scan due today (${why}). Same conditions: morning, fasted, no training the day before.`
      : `Evolt scan overdue since ${due} (${why}). Same conditions: morning, fasted, no training the day before.`
  const body: ScanDueNoteBody = { text, flag: 'scan_due', due, last_scan_date: schedule.last_scan_date }
  await eventInsert({ ...deps, actor: 'ai' }, { kind: 'note', summary: text, body, date }).statement
  return { due, noted: true }
}
