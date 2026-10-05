// Owns: the scan tools — list_scans, get_scan, compare_scans (the scans module: Evolt 360 results with the engine's
// comparisons and the lean-loss guard). The sheet image link is left out: tools read the confirmed numbers only.
import { Count, Id, LocalDate, Scan, ScanChange } from '@fitness/shared/schemas'
import * as z from 'zod'
import { compareScanIds, getScan, listScans } from '../../../scans'
import { defineTool, type ToolDefinition } from '../define'

const ScanBrief = z.object({
  id: Id,
  date: LocalDate,
  confirmed: z.boolean(),
  weight_kg: z.number().nullable(),
  body_fat_pct: z.number().nullable(),
  body_fat_mass_kg: z.number().nullable(),
  lean_body_mass_kg: z.number().nullable(),
  skeletal_muscle_mass_kg: z.number().nullable(),
  visceral_fat_level: z.number().nullable(),
  waist_hip_ratio: z.number().nullable(),
  /** The lean-loss guard against the previous confirmed scan (null for the first scan or an unconfirmed one). */
  lean_loss_vs_previous: z.enum(['ok', 'lean_loss', 'hydration']).nullable(),
  /** Unconfirmed scans: the sheet-reading job's state. */
  extraction: z.enum(['queued', 'running', 'done', 'failed']).nullable(),
})

export const SCAN_TOOLS: readonly ToolDefinition[] = [
  defineTool({
    name: 'list_scans',
    title: 'List scans',
    area: 'scans',
    description:
      'Every Evolt 360 body-composition scan, newest first, with the headline numbers (weight, body fat %, fat and lean mass, skeletal muscle, visceral level, waist-to-hip) and the lean-loss guard against the previous scan. Unconfirmed uploads show their extraction state. Use get_scan for the full record and analysis. Read-only.',
    input: z.object({}),
    output: z.object({ scans: z.array(ScanBrief), total: Count }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    run: async (deps) => {
      const scans = await listScans(deps)
      return {
        total: scans.length,
        scans: scans.map((s) => ({
          id: s.id,
          date: s.date,
          confirmed: s.confirmed,
          weight_kg: s.record?.weight_kg ?? null,
          body_fat_pct: s.record?.body_fat_pct ?? null,
          body_fat_mass_kg: s.record?.body_fat_mass_kg ?? null,
          lean_body_mass_kg: s.record?.lean_body_mass_kg ?? null,
          skeletal_muscle_mass_kg: s.record?.skeletal_muscle_mass_kg ?? null,
          visceral_fat_level: s.record?.visceral_fat_level ?? null,
          waist_hip_ratio: s.record?.waist_hip_ratio ?? null,
          lean_loss_vs_previous: s.analysis?.vs_previous?.lean_loss ?? null,
          extraction: s.extraction?.status ?? null,
        })),
      }
    },
  }),
  defineTool({
    name: 'get_scan',
    title: 'Get a scan',
    area: 'scans',
    description:
      "One scan in full: the confirmed record (every metric, the five segments' lean and fat, the conditions it was taken under), and its analysis — comparisons with the previous scan and the baseline (fat vs lean vs water, lean share of the loss, the lean-loss guard: lean > 25 % of the loss is flagged unless a matching water drop makes it hydration), flags, milestones reached and the debrief. Read-only.",
    input: z.object({ id: Id }),
    output: Scan,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    run: async (deps, { id }) => ({ ...(await getScan(deps, id)), sheet_url: null }),
  }),
  defineTool({
    name: 'compare_scans',
    title: 'Compare two scans',
    area: 'scans',
    description:
      'The engine comparison of two confirmed scans (the later against the earlier, in either order): signed changes per metric and segment, fat vs lean vs water, lean share of the loss, the lean-loss guard and the composition milestones newly met. Read-only.',
    input: z.object({ a: Id, b: Id }),
    output: ScanChange,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    run: (deps, { a, b }) => compareScanIds(deps, a, b),
  }),
]
