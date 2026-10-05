// Owns: keeping daily_targets.is_fast_day in step with the fast log — for a fast being planned, moved, started, ended
// or cancelled, the statements rebuilding the local dates it can touch (start date … +3 days, or its end date) from
// today on, through the plan module, computed as if the fast write had landed so the caller runs both in ONE batch.
// Past dates are history and stay as they were; v_day's `fasted` already reads fast_logs live.
import { addDays, today } from '@fitness/shared/engine'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Deps } from '../../../lib/deps'
import { targetStatementsFor, type PendingInputs } from '../../plan'

type FastDates = { start_date: string; end_date: string | null }

/** Daily-target statements for the dates `fasts` touch (before and after the write), as of `pending`. */
export async function fastDayStatements(deps: Deps, pending: PendingInputs, ...fasts: (FastDates | undefined)[]): Promise<BatchItem<'sqlite'>[]> {
  const now = today(deps.now())
  const ranges = new Map<string, { from: string; to: string }>()
  for (const f of fasts) {
    if (!f) continue
    const from = f.start_date > now ? f.start_date : now
    const late = addDays(f.start_date, 3)
    const to = f.end_date && f.end_date > late ? f.end_date : late
    if (from <= to) ranges.set(`${from}:${to}`, { from, to })
  }
  const out: BatchItem<'sqlite'>[] = []
  for (const range of ranges.values()) out.push(...(await targetStatementsFor(deps, range, pending)))
  return out
}
