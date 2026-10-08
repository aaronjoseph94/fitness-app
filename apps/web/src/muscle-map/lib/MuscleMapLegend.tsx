// Owns: the muscle-map legend — the four step keys (Light → Heavy, 8 × 8 squares), the same colours as the map.
import { LegendChips, type LegendItem } from '../../components'
import { LEVEL_LABELS, levelColor, type MuscleLevel } from './levels'

export interface MuscleMapLegendProps {
  /** Also show the grey "Not trained" chip. Default false. */
  showNone?: boolean
  dense?: boolean
}

export function MuscleMapLegend({ showNone = false, dense = false }: MuscleMapLegendProps) {
  const levels: MuscleLevel[] = showNone ? [0, 1, 2, 3, 4] : [1, 2, 3, 4]
  const items: LegendItem[] = levels.map((l) => ({ label: LEVEL_LABELS[l], color: levelColor(l) }))
  return <LegendChips items={items} dense={dense} />
}
