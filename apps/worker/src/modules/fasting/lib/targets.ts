// Owns: keeping daily_targets.is_fast_day in step with the fast log — for a fast being planned, moved, started, ended
// or cancelled, the statements rebuilding the local dates it can touch (start date … +3 days, or its end date) from
// today on, plus its own fast day before and after the write when that day is already past (a missed fast marked
// "didn't fast", or one ended early, gives its day back; the plan module keeps a past date's plan version), through the
// plan module, computed as if the fast write had landed so the caller runs both in ONE batch.
import { addDays, fastDay, today } from '@fitness/shared/engine'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Deps } from '../../../lib/deps'
import { targetStatementsFor, type PendingInputs } from '../../plan'

/** A fast as stored before the write, or as it will be after it. */
type FastWindow = { started_at: string; ended_at: string | null; start_date: string; end_date: string | null }

/**
 * Daily-target statements for the dates `fasts` touch (before and after the write), as of `pending`:
 *   today on:  max(start_date, today) … max(start_date + 3, end_date)
 *   the past:  fastDay(fast, fast_hours) of each window when it is before today (that one date)
 */
export async function fastDayStatements(
  deps: Deps,
  pending: PendingInputs,
  fastHours: number,
  ...fasts: (FastWindow | undefined)[]
): Promise<BatchItem<'sqlite'>[]> {
  const now = today(deps.now())
  const ranges = new Map<string, { from: string; to: string }>()
  for (const f of fasts) {
    if (!f) continue
    const from = f.start_date > now ? f.start_date : now
    const late = addDays(f.start_date, 3)
    const to = f.end_date && f.end_date > late ? f.end_date : late
    if (from <= to) ranges.set(`${from}:${to}`, { from, to })
    const day = fastDay(f, fastHours)
    if (day !== null && day < now) ranges.set(`${day}:${day}`, { from: day, to: day })
  }
  const out: BatchItem<'sqlite'>[] = []
  for (const range of ranges.values()) out.push(...(await targetStatementsFor(deps, range, pending)))
  return out
}
