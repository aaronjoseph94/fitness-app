// Owns: the muscle-map legend — the four step keys in the map's own colours, as named chips (Light, Moderate, Hard,
// Heavy; the default) or as 1d's compact scale ("Light ▭▭▭▭ Heavy": four 18 × 10 swatches between the two ends).
import Box from '@mui/material/Box'
import { LegendChips, type LegendItem } from '../../components'
import { tokens } from '../../theme'
import { LEVEL_LABELS, levelColor, type MuscleLevel, type MuscleScale } from './levels'

export interface MuscleMapLegendProps {
  /** Also show the grey "Not trained" chip (chips only). Default false. */
  showNone?: boolean
  dense?: boolean
  /** `chips` (default): a named key per step. `scale`: the steps as one row of swatches from Light to Heavy. */
  variant?: 'chips' | 'scale'
  /** The steps shown: `volume` (default) or a scan's `fat` share. */
  scale?: MuscleScale
}

const STEPS: readonly MuscleLevel[] = [1, 2, 3, 4]

export function MuscleMapLegend({
  showNone = false,
  dense = false,
  variant = 'chips',
  scale = 'volume',
}: MuscleMapLegendProps) {
  if (variant === 'scale')
    return (
      <Box
        role="img"
        aria-label={`Legend: ${STEPS.map((l) => LEVEL_LABELS[l]).join(', ')}`}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          fontSize: tokens.font.size.caption,
          fontWeight: tokens.font.weight.label,
          color: tokens.ink.secondary,
        }}
      >
        <span aria-hidden>{LEVEL_LABELS[1]}</span>
        {STEPS.map((l) => (
          <Box
            key={l}
            aria-hidden
            sx={{ width: 18, height: 10, borderRadius: '3px', bgcolor: levelColor(l, scale), flex: 'none' }}
          />
        ))}
        <span aria-hidden>{LEVEL_LABELS[4]}</span>
      </Box>
    )
  const levels: MuscleLevel[] = showNone ? [0, ...STEPS] : [...STEPS]
  const items: LegendItem[] = levels.map((l) => ({ label: LEVEL_LABELS[l], color: levelColor(l, scale) }))
  return <LegendChips items={items} dense={dense} />
}
