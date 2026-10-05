// Owns: assembling the trend series for a date range — every weigh-in up to `to` through the engine's EWMA (the
// trend depends on all history), the 7-day trend change at `to`, tape measurements in range, the active plan
// version's forecast, and milestones (stored rows; a weight milestone's date and scan filled from the trend if unset).
import { milestones as milestoneStatus, trendChange, trendWeights } from '@fitness/shared/engine'
import type { DateRange, TrendSeries } from '@fitness/shared/schemas'
import { and, asc, eq, gte, lte } from 'drizzle-orm'
import { measurements, milestones, plan_versions, scans, weight_logs } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { toMeasurement, toMilestone } from './rows'

export async function buildTrend(deps: Deps, { from, to }: DateRange): Promise<TrendSeries> {
  const { db } = deps
  const [weighIns, tape, [plan], stored, scanDates] = await db.batch([
    db
      .select({ date: weight_logs.date, weight_kg: weight_logs.weight_kg })
      .from(weight_logs)
      .where(lte(weight_logs.date, to))
      .orderBy(asc(weight_logs.date)),
    db
      .select()
      .from(measurements)
      .where(and(gte(measurements.date, from), lte(measurements.date, to)))
      .orderBy(asc(measurements.date), asc(measurements.site)),
    db.select({ forecast: plan_versions.forecast }).from(plan_versions).where(eq(plan_versions.active, true)).limit(1),
    db.select().from(milestones).orderBy(asc(milestones.kind), asc(milestones.target_value)),
    db.select({ id: scans.id, scanned_at: scans.scanned_at }).from(scans).where(eq(scans.confirmed, true)),
  ])

  // Full history to `to`: the 7-day change and the milestone dates need trend values from before `from`.
  const history = trendWeights(weighIns, { to })
  const weightRows = stored.filter((r) => r.kind === 'weight')
  const reached = new Map(
    milestoneStatus({ trend: history, scans: scanDates, definitions: weightRows.map((r) => ({ id: r.id, kind: 'weight', target_value: r.target_value })) }).map((m) => [m.id, m]),
  )

  return {
    from,
    to,
    points: history.filter((p) => p.date >= from),
    change_7d_kg: trendChange(history, to, 7),
    measurements: tape.map(toMeasurement),
    forecast: plan?.forecast ?? null,
    milestones: stored.map((row) => {
      const m = toMilestone(row)
      const computed = m.kind === 'weight' && m.reached_on === null ? reached.get(m.id) : undefined
      return computed?.reached_on ? { ...m, reached_on: computed.reached_on, scan_id: m.scan_id ?? computed.scan_id } : m
    }),
  }
}
