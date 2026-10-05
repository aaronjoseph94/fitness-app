// Owns: milestones (SPEC §3) — when each stored milestone was reached: a weight milestone from the trend (with the
// nearest scan), a composition milestone (visceral level, body fat %, waist-to-hip ratio, a segment's fat) from the
// first scan meeting it. The SPEC §3 list is kept as seed data and for a scan's "milestones reached" call-out.
import type { MilestoneKind } from '../../schemas/body'
import type { LocalDate } from '../../schemas/common'
import type { ScanSegment } from '../../schemas/scans'
import { daysBetween, localDate } from './dates'
import type { TrendSample } from './trend'

/** The composition fields a milestone reads from a scan (structurally a subset of `ScanRecord`). */
export type CompositionScan = {
  body_fat_pct?: number | null
  visceral_fat_level?: number | null
  waist_hip_ratio?: number | null
  segments?: Partial<Record<ScanSegment, { fat_kg: number } | null>> | null
}

/** A milestone to evaluate (structurally a stored `Milestone` row); `segment` is read for kind 'segment' only. */
export type MilestoneDefinition = {
  id: string
  kind: MilestoneKind
  target_value: number
  segment?: string | null
}

/** Where a milestone stands, keyed by its definition's id. */
export type MilestoneStatus = {
  id: string
  kind: MilestoneKind
  target_value: number
  reached_on: LocalDate | null
  scan_id: string | null
}

/** Scale milestones (SPEC §3, seed data): reached when trend weight ≤ target. */
export const WEIGHT_MILESTONES_KG = [90, 85, 80, 75, 70, 65] as const

/** The segment a 'segment' milestone reads when it names none (SPEC §3: torso fat). */
const DEFAULT_SEGMENT: ScanSegment = 'torso'

const below = (v: number | null | undefined, t: number) => v !== null && v !== undefined && v < t

/**
 * Whether a scan meets a composition milestone with target T:
 *   visceral_level: visceral_fat_level ≤ T;   body_fat_pct: body_fat_pct < T;   whr: waist_hip_ratio < T;
 *   segment:        segments[segment ?? torso].fat_kg < T;                       weight: never (the trend decides)
 */
function meets(def: Pick<MilestoneDefinition, 'kind' | 'target_value' | 'segment'>, scan: CompositionScan): boolean {
  const t = def.target_value
  switch (def.kind) {
    case 'visceral_level':
      return scan.visceral_fat_level != null && scan.visceral_fat_level <= t
    case 'body_fat_pct':
      return below(scan.body_fat_pct, t)
    case 'whr':
      return below(scan.waist_hip_ratio, t)
    case 'segment':
      return below(scan.segments?.[(def.segment ?? DEFAULT_SEGMENT) as ScanSegment]?.fat_kg, t)
    case 'weight':
      return false
  }
}

type CompositionMilestone = { kind: MilestoneKind; label: string; target_value: number; segment?: ScanSegment }

/** Composition milestones (SPEC §3, seed data): visceral level ≤ 9; body fat < 30 / 25 / 20 %; WHR < 0.90; torso fat < 10.4 kg. */
export const COMPOSITION_MILESTONES: readonly CompositionMilestone[] = [
  { kind: 'visceral_level', label: 'Visceral fat level ≤ 9', target_value: 9 },
  { kind: 'body_fat_pct', label: 'Body fat < 30 %', target_value: 30 },
  { kind: 'body_fat_pct', label: 'Body fat < 25 %', target_value: 25 },
  { kind: 'body_fat_pct', label: 'Body fat < 20 %', target_value: 20 },
  { kind: 'whr', label: 'Waist-to-hip ratio < 0.90', target_value: 0.9 },
  { kind: 'segment', label: 'Torso fat < 10.4 kg', target_value: 10.4, segment: 'torso' },
]

/** The SPEC §3 composition milestones a scan meets. */
export function compositionMilestonesMet(scan: CompositionScan): CompositionMilestone[] {
  return COMPOSITION_MILESTONES.filter((m) => meets(m, scan))
}

/**
 * Every definition with the date it was reached (one result per definition, by id):
 *   weight T:      reached_on = first date with trend_kg ≤ T; scan_id = the scan nearest that date (|Δdays| min)
 *   composition M: reached_on = local date of the first scan (by scanned_at) meeting M (see `meets`); scan_id = that scan
 */
export function milestones(input: {
  trend: readonly TrendSample[]
  scans: readonly (CompositionScan & { id: string; scanned_at: string })[]
  definitions: readonly MilestoneDefinition[]
}): MilestoneStatus[] {
  const trend = [...input.trend].filter((p) => p.trend_kg !== null).sort((a, b) => (a.date < b.date ? -1 : 1))
  const scans = input.scans
    .map((s) => ({ ...s, date: localDate(s.scanned_at) }))
    .sort((a, b) => Date.parse(a.scanned_at) - Date.parse(b.scanned_at))
  const nearestScan = (date: LocalDate): string | null => {
    let best: { id: string; gap: number } | null = null
    for (const s of scans) {
      const gap = Math.abs(daysBetween(date, s.date))
      if (best === null || gap < best.gap) best = { id: s.id, gap }
    }
    return best?.id ?? null
  }

  return input.definitions.map((def): MilestoneStatus => {
    const { id, kind, target_value } = def
    if (kind === 'weight') {
      const hit = trend.find((p) => p.trend_kg! <= target_value)
      return { id, kind, target_value, reached_on: hit?.date ?? null, scan_id: hit ? nearestScan(hit.date) : null }
    }
    const hit = scans.find((s) => meets(def, s))
    return { id, kind, target_value, reached_on: hit?.date ?? null, scan_id: hit?.id ?? null }
  })
}
