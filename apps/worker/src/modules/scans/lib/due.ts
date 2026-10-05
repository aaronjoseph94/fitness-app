// Owns: when the next scan is due (SPEC §3, §8: every settings.scan_interval_days, default 28) and the nightly
// "scan due" note — once on the due date, then weekly while overdue, never while a newer sheet waits to be confirmed.
import { addDays } from '@fitness/shared/engine'
import type { LocalDate } from '@fitness/shared/schemas'
import { and, desc, eq, gte } from 'drizzle-orm'
import { ai_events, scans, settings } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { eventInsert } from '../../events'
import { ScanDueNoteBody } from './note'

/** A due note is repeated at most this often while the scan is overdue. */
const REPEAT_DAYS = 7

export interface ScanSchedule {
  /** Local date of the last confirmed scan (null before the first). */
  last_scan_date: LocalDate | null
  interval_days: number
  /** last_scan_date + interval_days (null before the first scan). */
  due: LocalDate | null
  /** Local date of the newest uploaded sheet still waiting to be confirmed, if any. */
  awaiting_confirmation: LocalDate | null
}

export async function scanSchedule(deps: Deps): Promise<ScanSchedule> {
  const { db } = deps
  const [[s], [last], [waiting]] = await db.batch([
    db.select({ interval: settings.scan_interval_days }).from(settings).limit(1),
    db.select({ date: scans.date }).from(scans).where(eq(scans.confirmed, true)).orderBy(desc(scans.scanned_at)).limit(1),
    db.select({ date: scans.date }).from(scans).where(eq(scans.confirmed, false)).orderBy(desc(scans.scanned_at)).limit(1),
  ])
  const interval_days = s?.interval ?? 28
  const last_scan_date = last?.date ?? null
  return {
    last_scan_date,
    interval_days,
    due: last_scan_date ? addDays(last_scan_date, interval_days) : null,
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
  const text =
    due === date
      ? `Evolt scan due today (last ${schedule.last_scan_date}, every ${schedule.interval_days} days). Same conditions: morning, fasted, no training the day before.`
      : `Evolt scan overdue since ${due} (last ${schedule.last_scan_date}). Same conditions: morning, fasted, no training the day before.`
  const body: ScanDueNoteBody = { text, flag: 'scan_due', due, last_scan_date: schedule.last_scan_date }
  await eventInsert({ ...deps, actor: 'ai' }, { kind: 'note', summary: text, body, date }).statement
  return { due, noted: true }
}
