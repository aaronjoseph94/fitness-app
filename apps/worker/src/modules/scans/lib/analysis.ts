// Owns: the engine side of a scan analysis (SPEC §3, §8) — where a scan sits among the confirmed scans (previous and
// baseline), the engine comparison as the contract's ScanChange, the call-outs (lean-loss guard, water shift,
// visceral fat up, fat gain, conditions unlike the baseline) and the plain narrative used when no LLM answers.
import { compareScans, localDate } from '@fitness/shared/engine'
import { MilestoneKind, type ScanChange, type ScanFlag, type ScanRecord } from '@fitness/shared/schemas'

/** A confirmed scan: its id and record. */
export interface ConfirmedScan {
  id: string
  record: ScanRecord
}

/** Confirmed scans in scan order (scanned_at ascending). */
export function inScanOrder<T extends ConfirmedScan>(scans: readonly T[]): T[] {
  return [...scans].sort((a, b) => (a.record.scanned_at < b.record.scanned_at ? -1 : a.record.scanned_at > b.record.scanned_at ? 1 : 0))
}

/** The scan before `id` and the baseline (the first scan); null when `id` is itself the first (or not confirmed). */
export function neighbours(ordered: readonly ConfirmedScan[], id: string): { previous: ConfirmedScan | null; baseline: ConfirmedScan | null } {
  const i = ordered.findIndex((s) => s.id === id)
  if (i <= 0) return { previous: null, baseline: null }
  return { previous: ordered[i - 1]!, baseline: ordered[0]! }
}

/** compareScans(earlier, later) as the contract's ScanChange (signed, later − earlier). */
export function scanChange(earlier: ConfirmedScan, later: ConfirmedScan): ScanChange {
  const c = compareScans(earlier.record, later.record)
  return {
    scan_id: earlier.id,
    date: localDate(earlier.record.scanned_at),
    days: c.days,
    deltas: c.deltas,
    segments: c.segments,
    fat_vs_lean: c.fat_vs_lean,
    lean_share_of_loss: c.lean_share_of_loss,
    lean_loss: c.lean_loss,
    milestones_reached: c.milestones_reached.flatMap((m) => {
      const kind = MilestoneKind.safeParse(m.kind)
      return kind.success ? [{ kind: kind.data, label: m.label, target_value: m.target_value }] : []
    }),
  }
}

const kg = (v: number) => `${Math.abs(v).toFixed(1)} kg`
const signedKg = (v: number) => (Math.abs(v) < 0.05 ? kg(0) : `${v < 0 ? '−' : '+'}${kg(v)}`)
const pct = (share: number) => `${Math.round(share * 100)} %`

/** Baseline conditions (SPEC §3): morning, fasted, no training the day before (≥ 24 h), normal hydration. */
export function conditionDifferences(record: ScanRecord): string[] {
  const c = record.conditions
  const out: string[] = []
  if (c.time_of_day !== 'morning') out.push(`scanned in the ${c.time_of_day}`)
  if (c.fasted === false) out.push('not fasted')
  if (c.hours_since_training !== null && c.hours_since_training < 24) out.push(`trained ${c.hours_since_training} h before`)
  if (c.matches_baseline === false && out.length === 0) out.push('conditions differ from the baseline')
  return out
}

/**
 * Call-outs for a scan against the previous one:
 *   lean_loss     guard = lean_loss  (lean lost > 25 % of weight lost, not matched by water)
 *   water_shift   guard = hydration  (lean drop matched by a ≥ 90 % water drop)
 *   visceral_up   Δ visceral level > 0 or Δ visceral area > 0
 *   fat_gain      Δ fat mass > 0
 *   conditions_mismatch  any difference from the baseline conditions (or Aaron said they differ)
 */
export function scanFlags(record: ScanRecord, vsPrevious: ScanChange | null): ScanFlag[] {
  const flags: ScanFlag[] = []
  if (vsPrevious) {
    const { fat_vs_lean: f, lean_share_of_loss: share, deltas: d } = vsPrevious
    if (vsPrevious.lean_loss === 'lean_loss' && share !== null)
      flags.push({
        code: 'lean_loss',
        message: `Lean mass was ${pct(share)} of the ${kg(f.weight_kg)} lost since ${vsPrevious.date} (guard: 25 %). More protein, keep the lifting volume up, fewer deficit extras.`,
      })
    if (vsPrevious.lean_loss === 'hydration')
      flags.push({
        code: 'water_shift',
        message: `Lean mass fell ${kg(f.lean_kg)} with ${kg(f.water_kg)} less body water: a hydration shift, not muscle.`,
      })
    const level = d.visceral_fat_level ?? 0
    const area = d.visceral_fat_area_cm2 ?? 0
    if (level > 0 || area > 0)
      flags.push({
        code: 'visceral_up',
        message: `Visceral fat rose since ${vsPrevious.date}: level ${level > 0 ? '+' : ''}${level}, area ${area > 0 ? '+' : ''}${Math.round(area)} cm².`,
      })
    if (f.fat_kg > 0) flags.push({ code: 'fat_gain', message: `Fat mass up ${kg(f.fat_kg)} since ${vsPrevious.date}.` })
  }
  const diffs = conditionDifferences(record)
  if (diffs.length > 0)
    flags.push({
      code: 'conditions_mismatch',
      message: `Not the baseline conditions (${diffs.join(', ')}): water and lean changes are less comparable.`.slice(0, 300),
    })
  return flags
}

/** The engine-only debrief: a few plain sentences from the comparisons, for when no LLM answers. */
export function plainNarrative(record: ScanRecord, vsPrevious: ScanChange | null, vsBaseline: ScanChange | null, flags: readonly ScanFlag[]): string {
  if (!vsPrevious) return `Baseline scan on ${localDate(record.scanned_at)}: ${kg(record.weight_kg)}, ${record.body_fat_pct} % body fat, visceral level ${record.visceral_fat_level}.`
  const f = vsPrevious.fat_vs_lean
  const parts = [
    `Since ${vsPrevious.date} (${vsPrevious.days} days): weight ${signedKg(f.weight_kg)}, fat ${signedKg(f.fat_kg)}, lean ${signedKg(f.lean_kg)}, body water ${signedKg(f.water_kg)}.`,
  ]
  // The lean-loss flag below says it with the guard; otherwise give the share here.
  if (vsPrevious.lean_share_of_loss !== null && vsPrevious.lean_loss !== 'lean_loss')
    parts.push(`Lean mass was ${pct(Math.max(0, vsPrevious.lean_share_of_loss))} of the loss.`)
  const torso = vsPrevious.segments.torso
  const level = vsPrevious.deltas.visceral_fat_level
  if (level !== undefined) parts.push(`Visceral fat level ${record.visceral_fat_level - level} → ${record.visceral_fat_level}${torso ? `; torso fat ${signedKg(torso.fat_kg)}` : ''}.`)
  if (vsBaseline && vsBaseline.scan_id !== vsPrevious.scan_id) {
    const b = vsBaseline.fat_vs_lean
    parts.push(`Since the baseline (${vsBaseline.date}): fat ${signedKg(b.fat_kg)}, lean ${signedKg(b.lean_kg)}.`)
  }
  for (const flag of flags) parts.push(flag.message)
  return parts.join(' ').slice(0, 3000)
}
