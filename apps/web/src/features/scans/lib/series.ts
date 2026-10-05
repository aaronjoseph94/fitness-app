// Owns: mapping API scans to the scan charts' plain series (fat vs lean, body fat % and visceral level, segmental fat
// baseline vs a scan), the gauge bands for the Evolt ranges, the SPEC §3 composition targets, and the next due date.
import type { CompositionScan, FatScan, GaugeBand, SegmentFat } from '../../../charts'
import type { Scan, ScanRecord, ScanSegment } from '@fitness/shared/schemas'
import { shiftDate } from '../../quick-log'

/** SPEC §3: body fat ≤ 18 % at goal (about 11.7 kg fat); visceral level 9 or lower. */
export const TARGETS = { fatMassKg: 11.7, bodyFatPct: 18, visceralLevel: 9 } as const

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

/** Fat kg per segment at the baseline and at `latest`. */
export function segmentalFat(baseline: ScanRecord, latest: ScanRecord): SegmentFat[] {
  return SEGMENTS.map((s) => ({ segment: SEGMENT_LABEL[s], baseline: baseline.segments[s].fat_kg, latest: latest.segments[s].fat_kg }))
}

/** Next scan due: last confirmed scan date + interval (null before the first scan). */
export function nextDue(scans: readonly ConfirmedScan[], intervalDays: number): string | null {
  const last = scans.at(-1)
  return last ? shiftDate(last.date, intervalDays) : null
}
