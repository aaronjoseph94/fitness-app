// Owns: re-anchoring the stored milestones after a scan is confirmed (SPEC §3 "each scan re-anchors the composition
// milestones") — the engine's `milestones` over every confirmed scan and the weigh-in trend, matched to the stored rows
// by kind and target value: composition milestones take the first scan meeting them; reached weight milestones take
// the scan nearest the date the trend reached them. Returns the UPDATE statements for the caller's db.batch.
import { milestones as milestoneStatus, trendWeights } from '@fitness/shared/engine'
import { MilestoneKind, type ScanMilestoneUpdate } from '@fitness/shared/schemas'
import { asc, eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { milestones, weight_logs } from '../../../db'
import type { Deps } from '../../../lib/deps'
import type { ConfirmedScan } from './analysis'

export async function reanchorMilestones(
  deps: Deps,
  confirmed: readonly ConfirmedScan[],
): Promise<{ updates: ScanMilestoneUpdate[]; statements: BatchItem<'sqlite'>[] }> {
  const { db } = deps
  const [stored, weighIns] = await db.batch([
    db.select().from(milestones),
    db.select({ date: weight_logs.date, weight_kg: weight_logs.weight_kg }).from(weight_logs).orderBy(asc(weight_logs.date)),
  ])
  const computed = milestoneStatus({
    trend: trendWeights(weighIns),
    scans: confirmed.map((s) => ({ id: s.id, ...s.record })),
  })
  const now = deps.now().toISOString()
  const updates: ScanMilestoneUpdate[] = []
  const statements: BatchItem<'sqlite'>[] = []
  for (const row of stored) {
    const c = computed.find((m) => m.kind === row.kind && Math.abs(m.target_value - row.target_value) < 1e-9)
    if (!c) continue
    let next: { reached_on: string | null; scan_id: string | null }
    if (row.kind === 'weight') {
      // The trend, not the scan, decides a weight milestone; the scan only anchors it (nearest scan).
      if (c.reached_on === null || c.scan_id === row.scan_id) continue
      next = { reached_on: row.reached_on ?? c.reached_on, scan_id: c.scan_id }
    } else {
      if (c.reached_on === row.reached_on && c.scan_id === row.scan_id) continue
      next = { reached_on: c.reached_on, scan_id: c.scan_id }
    }
    statements.push(db.update(milestones).set({ ...next, actor: deps.actor, updated_at: now }).where(eq(milestones.id, row.id)))
    updates.push({ milestone_id: row.id, kind: MilestoneKind.parse(row.kind), label: row.label, reached_on: next.reached_on })
  }
  return { updates, statements }
}
