// Owns: keeping daily_targets.is_fast_day in step with the fast log — after a fast is planned, moved, started or ended,
// rebuild the local dates it can touch (start date … +3 days, or its end date) from today on, through the plan
// module. Past dates are history and stay as they were; v_day's `fasted` already reads fast_logs live.
import { addDays, today } from '@fitness/shared/engine'
import type { Deps } from '../../../lib/deps'
import { materialiseTargets } from '../../plan'

type FastDates = { start_date: string; end_date: string | null }

export async function rebuildFastDays(deps: Deps, ...fasts: (FastDates | undefined)[]): Promise<void> {
  const now = today(deps.now())
  const ranges = new Map<string, { from: string; to: string }>()
  for (const f of fasts) {
    if (!f) continue
    const from = f.start_date > now ? f.start_date : now
    const late = addDays(f.start_date, 3)
    const to = f.end_date && f.end_date > late ? f.end_date : late
    if (from <= to) ranges.set(`${from}:${to}`, { from, to })
  }
  for (const range of ranges.values()) {
    try {
      await materialiseTargets(deps, range)
    } catch (err) {
      // The fast is saved; stale targets heal on the next plan change. Never fail the log for this.
      console.error(JSON.stringify({ level: 'error', msg: 'fast day targets not rebuilt', range, error: String(err) }))
    }
  }
}
