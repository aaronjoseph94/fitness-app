// Owns: re-anchoring the stored milestones after a scan is confirmed (SPEC §3 "each scan re-anchors the composition
// milestones") — the engine's `milestones` over every stored milestone row (seeded or added by the coach), every
// confirmed scan and the weigh-in trend, matched back by id: composition milestones take the first scan meeting them;
// reached weight milestones take the scan nearest the date the trend reached them. Returns the UPDATE statements for
// the caller's db.batch. Also the one place other modules add or remove a milestone row (apply_review / revert_review).
import { milestones as milestoneStatus, trendWeights } from '@fitness/shared/engine'
import { MilestoneKind, type ScanMilestoneUpdate, type ScanSegment } from '@fitness/shared/schemas'
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
  const computed = new Map(
    milestoneStatus({
      trend: trendWeights(weighIns),
      scans: confirmed.map((s) => ({ id: s.id, ...s.record })),
      definitions: stored.map((r) => ({ id: r.id, kind: MilestoneKind.parse(r.kind), target_value: r.target_value, segment: r.segment })),
    }).map((m) => [m.id, m]),
  )
  const now = deps.now().toISOString()
  const updates: ScanMilestoneUpdate[] = []
  const statements: BatchItem<'sqlite'>[] = []
  for (const row of stored) {
    const c = computed.get(row.id)
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

/** Add a milestone (a target value reached at or below it); returns its id. The next scan re-anchors it. */
export async function addMilestone(
  deps: Deps,
  input: { kind: MilestoneKind; segment: ScanSegment | null; target_value: number; label: string },
): Promise<string> {
  const id = crypto.randomUUID()
  const now = deps.now().toISOString()
  await deps.db.insert(milestones).values({
    id,
    kind: input.kind,
    segment: input.kind === 'segment' ? input.segment : null,
    target_value: input.target_value,
    label: input.label,
    actor: deps.actor,
    created_at: now,
    updated_at: now,
  })
  return id
}

/** Remove a milestone (a replay is a no-op). */
export async function removeMilestone(deps: Deps, id: string): Promise<void> {
  await deps.db.delete(milestones).where(eq(milestones.id, id))
}
