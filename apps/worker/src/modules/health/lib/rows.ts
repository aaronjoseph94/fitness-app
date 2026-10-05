// Owns: mapping sleep_logs / step_logs rows to their contract shapes, and minutes asleep from in-bed and wake times.
import { SleepStages, type SleepLog, type StepLog } from '@fitness/shared/schemas'
import type { Row, sleep_logs, step_logs } from '../../../db'

export const toSleepLog = (r: Row<typeof sleep_logs>): SleepLog => ({
  id: r.id,
  date: r.date,
  in_bed_at: r.in_bed_at,
  woke_at: r.woke_at,
  asleep_min: r.asleep_min ?? 0,
  source: r.source,
  stages: r.stages == null ? null : (SleepStages.safeParse(r.stages).data ?? null),
  created_at: r.created_at,
  updated_at: r.updated_at,
})

export const toStepLog = (r: Row<typeof step_logs>): StepLog => ({
  id: r.id,
  date: r.date,
  steps: r.steps,
  active_kcal: r.active_kcal,
  source: r.source,
  created_at: r.created_at,
  updated_at: r.updated_at,
})

/** asleep_min = round((woke_at − in_bed_at) / 60,000 ms); null unless both are given and in bed < woke. */
export function minutesInBed(in_bed_at: string | undefined, woke_at: string | undefined): number | null {
  if (!in_bed_at || !woke_at) return null
  const ms = Date.parse(woke_at) - Date.parse(in_bed_at)
  return ms > 0 ? Math.min(24 * 60, Math.round(ms / 60_000)) : null
}
