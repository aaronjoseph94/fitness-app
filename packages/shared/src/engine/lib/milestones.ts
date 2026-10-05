// Owns: milestones (SPEC §3) — which weight milestones the trend has reached and when (with the nearest scan), and
// which composition milestones a scan meets (visceral level, body fat %, waist-to-hip ratio, torso fat).
import type { LocalDate } from '../../schemas/common'
import { daysBetween, localDate } from './dates'
import type { TrendSample } from './trend'

/** The composition fields a milestone reads from a scan (structurally a subset of `ScanRecord`). */
export type CompositionScan = {
  body_fat_pct?: number | null
  visceral_fat_level?: number | null
  waist_hip_ratio?: number | null
  segments?: { torso?: { fat_kg: number } | null } | null
}

export type MilestoneKindKey = 'weight' | 'body_fat_pct' | 'visceral_level' | 'whr' | 'segment'

/** A milestone and where it stands (structurally a `Milestone` without the row fields). */
export type MilestoneStatus = {
  kind: MilestoneKindKey
  label: string
  target_value: number
  reached_on: LocalDate | null
  scan_id: string | null
}

/** Scale milestones (SPEC §3): reached when trend weight ≤ target. */
export const WEIGHT_MILESTONES_KG = [90, 85, 80, 75, 70, 65] as const

type CompositionMilestone = { kind: MilestoneKindKey; label: string; target_value: number; met: (scan: CompositionScan) => boolean }

const below = (v: number | null | undefined, t: number) => v !== null && v !== undefined && v < t

/** Composition milestones (SPEC §3): visceral level ≤ 9; body fat < 30 / 25 / 20 %; WHR < 0.90; torso fat < 10.4 kg. */
export const COMPOSITION_MILESTONES: readonly CompositionMilestone[] = [
  { kind: 'visceral_level', label: 'Visceral fat level ≤ 9', target_value: 9, met: (s) => s.visceral_fat_level != null && s.visceral_fat_level <= 9 },
  { kind: 'body_fat_pct', label: 'Body fat < 30 %', target_value: 30, met: (s) => below(s.body_fat_pct, 30) },
  { kind: 'body_fat_pct', label: 'Body fat < 25 %', target_value: 25, met: (s) => below(s.body_fat_pct, 25) },
  { kind: 'body_fat_pct', label: 'Body fat < 20 %', target_value: 20, met: (s) => below(s.body_fat_pct, 20) },
  { kind: 'whr', label: 'Waist-to-hip ratio < 0.90', target_value: 0.9, met: (s) => below(s.waist_hip_ratio, 0.9) },
  { kind: 'segment', label: 'Torso fat < 10.4 kg', target_value: 10.4, met: (s) => below(s.segments?.torso?.fat_kg, 10.4) },
]

/** The composition milestones a scan meets. */
export function compositionMilestonesMet(scan: CompositionScan): CompositionMilestone[] {
  return COMPOSITION_MILESTONES.filter((m) => m.met(scan))
}

/**
 * Every milestone with the date it was reached:
 *   weight T:      reached_on = first date with trend_kg ≤ T; scan_id = the scan nearest that date (|Δdays| min)
 *   composition M: reached_on = local date of the first scan (by scanned_at) meeting M; scan_id = that scan
 */
export function milestones(input: {
  trend: readonly TrendSample[]
  scans: readonly (CompositionScan & { id: string; scanned_at: string })[]
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

  const weight: MilestoneStatus[] = WEIGHT_MILESTONES_KG.map((t) => {
    const hit = trend.find((p) => p.trend_kg! <= t)
    return { kind: 'weight', label: `${t} kg`, target_value: t, reached_on: hit?.date ?? null, scan_id: hit ? nearestScan(hit.date) : null }
  })
  const composition: MilestoneStatus[] = COMPOSITION_MILESTONES.map((m) => {
    const hit = scans.find((s) => m.met(s))
    return { kind: m.kind, label: m.label, target_value: m.target_value, reached_on: hit?.date ?? null, scan_id: hit?.id ?? null }
  })
  return [...weight, ...composition]
}
