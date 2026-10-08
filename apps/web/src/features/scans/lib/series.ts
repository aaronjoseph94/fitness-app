// Owns: mapping API scans to the scan charts' plain series (fat vs lean, body fat % and visceral level, segmental fat
// baseline vs a scan), the gauge bands for the Evolt ranges, the SPEC §3 composition targets, each segment's fat
// share and the muscle-map levels it paints, and the next due date.
import type { CompositionScan, FatScan, GaugeBand, SegmentFat } from '../../../charts'
import type { MuscleLevel } from '../../../muscle-map'
import type { Muscle, Scan, ScanRecord, ScanSegment } from '@fitness/shared/schemas'

/**
 * SPEC §3: body fat ≤ 18 % at goal (about 11.7 kg fat, 53.3 kg lean); visceral level 9 or lower; segmental torso fat
 * under 10.4 kg.
 */
export const TARGETS = { fatMassKg: 11.7, leanMassKg: 53.3, bodyFatPct: 18, visceralLevel: 9, torsoFatKg: 10.4 } as const

/** Evolt's healthy body-fat range for Aaron's profile, %. */
export const BODY_FAT_RANGE = { low: 15, high: 20 } as const

/** Evolt ranges: body fat 15–20 % healthy for Aaron's profile; visceral level 1–9 balanced. */
export const BODY_FAT_GAUGE = {
  min: 5,
  max: 45,
  bands: [
    { to: 20, tone: 'good', label: 'Healthy' },
    { to: 25, tone: 'warning', label: 'Above range' },
    { to: 45, tone: 'flag', label: 'High' },
  ] satisfies GaugeBand[],
}
export const VISCERAL_GAUGE = {
  min: 1,
  max: 30,
  bands: [
    { to: 9, tone: 'good', label: 'Balanced' },
    { to: 14, tone: 'warning', label: 'Above range' },
    { to: 30, tone: 'flag', label: 'High' },
  ] satisfies GaugeBand[],
}

export const SEGMENT_LABEL: Record<ScanSegment, string> = {
  left_arm: 'Left arm',
  right_arm: 'Right arm',
  torso: 'Torso',
  left_leg: 'Left leg',
  right_leg: 'Right leg',
}
export const SEGMENTS = Object.keys(SEGMENT_LABEL) as ScanSegment[]

export type ConfirmedScan = Scan & { record: ScanRecord }

/** Confirmed scans, oldest first. */
export function confirmedScans(scans: readonly Scan[]): ConfirmedScan[] {
  return scans
    .filter((s): s is ConfirmedScan => s.confirmed && s.record !== null)
    .sort((a, b) => (a.record.scanned_at < b.record.scanned_at ? -1 : 1))
}

export function compositionSeries(scans: readonly ConfirmedScan[]): CompositionScan[] {
  return scans.map((s) => ({ date: s.date, fatMass: s.record.body_fat_mass_kg, leanMass: s.record.lean_body_mass_kg }))
}

export function fatSeries(scans: readonly ConfirmedScan[]): FatScan[] {
  return scans.map((s) => ({ date: s.date, bodyFatPct: s.record.body_fat_pct, visceralLevel: s.record.visceral_fat_level }))
}

/** A segment's fat share: fat ÷ (fat + lean). */
export function fatShare(m: { lean_kg: number; fat_kg: number }): number {
  const total = m.lean_kg + m.fat_kg
  return total > 0 ? m.fat_kg / total : 0
}

/** The muscles a segment covers on the muscle map (left and right are one figure, so they share a region). */
const REGION_MUSCLES: Record<'torso' | 'legs' | 'arms', Muscle[]> = {
  torso: ['abdominals', 'chest', 'lats', 'lower back', 'middle back', 'traps'],
  legs: ['quadriceps', 'hamstrings', 'adductors', 'abductors', 'glutes', 'calves'],
  arms: ['biceps', 'triceps', 'forearms', 'shoulders'],
}

/**
 * Muscle-map levels for a scan's fat share by region (torso, both legs, both arms), relative to the region with the
 * highest share, so the figure shows where the fat sits (the table carries the numbers):
 * level = max(1, 4 − round((highest share − share) / 0.02)) — one step lighter per 2 percentage points below it.
 */
export function segmentFatLevels(record: ScanRecord): Partial<Record<Muscle, MuscleLevel>> {
  const s = record.segments
  const sum = (a: ScanSegment, b: ScanSegment) => ({ lean_kg: s[a].lean_kg + s[b].lean_kg, fat_kg: s[a].fat_kg + s[b].fat_kg })
  const shares = { torso: fatShare(s.torso), legs: fatShare(sum('left_leg', 'right_leg')), arms: fatShare(sum('left_arm', 'right_arm')) }
  const highest = Math.max(shares.torso, shares.legs, shares.arms)
  const level = (share: number): MuscleLevel => Math.max(1, 4 - Math.round((highest - share) / 0.02)) as MuscleLevel
  return Object.fromEntries(
    (Object.keys(REGION_MUSCLES) as (keyof typeof REGION_MUSCLES)[]).flatMap((r) => REGION_MUSCLES[r].map((m) => [m, level(shares[r])])),
  )
}

/** Fat kg per segment at the baseline and at `latest`. */
export function segmentalFat(baseline: ScanRecord, latest: ScanRecord): SegmentFat[] {
  return SEGMENTS.map((s) => ({ segment: SEGMENT_LABEL[s], baseline: baseline.segments[s].fat_kg, latest: latest.segments[s].fat_kg }))
}
