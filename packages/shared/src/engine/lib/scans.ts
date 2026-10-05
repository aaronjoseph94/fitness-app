// Owns: comparing two scans (SPEC §3, §8) — metric and segment deltas, fat vs lean vs water change, the lean-loss
// guard (with the hydration call-out) and the composition milestones newly reached.
import { daysBetween, localDate } from './dates'
import { compositionMilestonesMet, type CompositionScan } from './milestones'

/** Lean mass above this share of the weight lost between two scans raises the lean-loss guard (SPEC §3). */
export const LEAN_LOSS_SHARE = 0.25
/** A lean drop is hydration when the water drop is at least this share of it (dry lean — protein + mineral — held). */
export const HYDRATION_MATCH = 0.9

/** Whole-body metrics compared between scans (the numeric fields of the seed record, SPEC §2). */
const SCAN_METRICS = [
  'weight_kg',
  'lean_body_mass_kg',
  'skeletal_muscle_mass_kg',
  'protein_kg',
  'mineral_kg',
  'total_body_water_kg',
  'icf_kg',
  'ecf_kg',
  'body_fat_mass_kg',
  'body_fat_pct',
  'subcutaneous_fat_kg',
  'visceral_fat_kg',
  'visceral_fat_area_cm2',
  'visceral_fat_level',
  'bmr_kcal',
  'tee_kcal',
  'waist_hip_ratio',
  'bio_age',
  'bwi_score',
] as const
export type ScanMetricKey = (typeof SCAN_METRICS)[number]

const SEGMENTS = ['left_arm', 'right_arm', 'torso', 'left_leg', 'right_leg'] as const
type SegmentKey = (typeof SEGMENTS)[number]
type SegmentMass = { lean_kg: number; fat_kg: number }

/** A confirmed scan (structurally a subset of `ScanRecord`): four masses required, every other metric optional. */
export type ScanLike = Partial<Record<ScanMetricKey, number | null>> &
  CompositionScan & {
    scanned_at: string
    weight_kg: number
    lean_body_mass_kg: number
    body_fat_mass_kg: number
    total_body_water_kg: number
    segments?: Partial<Record<SegmentKey, SegmentMass | null>> | null
  }

export type ScanComparison = {
  days: number
  /** next − previous for every metric both scans carry. */
  deltas: Partial<Record<ScanMetricKey, number>>
  /** next − previous lean and fat per segment both scans carry. */
  segments: Partial<Record<SegmentKey, SegmentMass>>
  /** Signed kg changes (next − previous): weight, fat mass, lean mass, total body water. */
  fat_vs_lean: { weight_kg: number; fat_kg: number; lean_kg: number; water_kg: number }
  /** lean lost / weight lost, when weight was lost; else null. */
  lean_share_of_loss: number | null
  /** The lean-loss guard: ok, lean_loss (flag it), or hydration (a lean drop matched by a water drop). */
  lean_loss: 'ok' | 'lean_loss' | 'hydration'
  /** Composition milestones the newer scan meets and the older did not. */
  milestones_reached: { kind: string; label: string; target_value: number }[]
}

/**
 * Compare two scans (previous → next):
 *   Δ = next − previous for each metric and segment
 *   weight_lost = −Δweight, lean_lost = −Δlean, water_lost = −Δwater
 *   lean_share  = lean_lost / weight_lost                       (when weight_lost > 0)
 *   guard       = lean_share > 0.25 → (water_lost ≥ 0.9 × lean_lost ? hydration : lean_loss), else ok
 */
export function compareScans(previous: ScanLike, next: ScanLike): ScanComparison {
  const deltas: ScanComparison['deltas'] = {}
  for (const k of SCAN_METRICS) {
    const a = previous[k]
    const b = next[k]
    if (typeof a === 'number' && typeof b === 'number') deltas[k] = b - a
  }
  const segments: ScanComparison['segments'] = {}
  for (const k of SEGMENTS) {
    const a = previous.segments?.[k]
    const b = next.segments?.[k]
    if (a && b) segments[k] = { lean_kg: b.lean_kg - a.lean_kg, fat_kg: b.fat_kg - a.fat_kg }
  }

  const fat_vs_lean = {
    weight_kg: next.weight_kg - previous.weight_kg,
    fat_kg: next.body_fat_mass_kg - previous.body_fat_mass_kg,
    lean_kg: next.lean_body_mass_kg - previous.lean_body_mass_kg,
    water_kg: next.total_body_water_kg - previous.total_body_water_kg,
  }
  const weightLost = -fat_vs_lean.weight_kg
  const leanLost = -fat_vs_lean.lean_kg
  const waterLost = -fat_vs_lean.water_kg
  const share = weightLost > 0 ? leanLost / weightLost : null
  const lean_loss = share !== null && share > LEAN_LOSS_SHARE ? (waterLost >= HYDRATION_MATCH * leanLost ? 'hydration' : 'lean_loss') : 'ok'

  const before = new Set(compositionMilestonesMet(previous).map((m) => m.label))
  const milestones_reached = compositionMilestonesMet(next)
    .filter((m) => !before.has(m.label))
    .map(({ kind, label, target_value }) => ({ kind, label, target_value }))

  return {
    days: daysBetween(localDate(previous.scanned_at), localDate(next.scanned_at)),
    deltas,
    segments,
    fat_vs_lean,
    lean_share_of_loss: share,
    lean_loss,
    milestones_reached,
  }
}
