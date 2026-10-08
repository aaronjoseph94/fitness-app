// Owns: the muscle-map legend — the four step keys (Light → Heavy, 8 × 8 squares), the same colours as the map.
import { LegendChips, type LegendItem } from '../../components'
import { LEVEL_LABELS, levelColor, type MuscleLevel, type MuscleScale } from './levels'

export interface MuscleMapLegendProps {
  /** Also show the grey "Not trained" chip. Default false. */
  showNone?: boolean
  dense?: boolean
  /** The map's scale: `volume` (blue, default) or `fat` (rose). */
  scale?: MuscleScale
  /** Replace the level names, e.g. fat-share bands for a scan. Index 0 is "not trained". */
  labels?: Readonly<Partial<Record<MuscleLevel, string>>>
}

export function MuscleMapLegend({
  showNone = false,
  dense = false,
  scale = 'volume',
  labels,
}: MuscleMapLegendProps) {
  const levels: MuscleLevel[] = showNone ? [0, 1, 2, 3, 4] : [1, 2, 3, 4]
  const items: LegendItem[] = levels.map((l) => ({
    label: labels?.[l] ?? LEVEL_LABELS[l],
    color: levelColor(l, scale),
  }))
  return <LegendChips items={items} dense={dense} />
}
