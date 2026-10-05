// Owns: the row of metric rings on Today (calories, protein, water, steps, sleep): equal columns, label and
// "value / target" under each ring, wraps cleanly at phone width.
import Box from '@mui/material/Box'
import { tokens } from '../../theme'
import { MetricRing, type MetricRingProps } from './MetricRing'

export interface RingItem extends Omit<MetricRingProps, 'size' | 'thickness'> {
  /** Stable key, e.g. "protein". */
  id: string
  /** Line under the label, e.g. "96 / 130 g". */
  detail?: string
}

export interface RingsRowProps {
  rings: readonly RingItem[]
  /** Ring diameter in px. Default 58 (five rings fit in a card at 390 px). */
  size?: number
}

export function RingsRow({ rings, size = 58 }: RingsRowProps) {
  return (
    <Box
      data-testid="rings-row"
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${size}px, 1fr))`,
        columnGap: 1,
        rowGap: 4,
      }}
    >
      {rings.map(({ id, detail, ...ring }) => (
        <Box
          key={id}
          data-testid={`ring-${id}`}
          sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0 }}
        >
          <MetricRing {...ring} size={size} />
          <Box
            component="span"
            sx={{
              mt: 2,
              fontSize: tokens.font.size.label,
              fontWeight: tokens.font.weight.label,
              color: tokens.ink.text,
              textAlign: 'center',
              lineHeight: 1.2,
            }}
          >
            {ring.label}
          </Box>
          {detail && (
            <Box
              component="span"
              sx={{
                mt: 0.5,
                fontSize: 11,
                color: tokens.ink.secondary,
                textAlign: 'center',
                lineHeight: 1.3,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {detail}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  )
}
