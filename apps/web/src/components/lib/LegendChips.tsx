// Owns: the legend row under a chart title: a small key that mirrors the mark (bar swatch, line, dashed target, dot) + a label in text ink.
import Box from '@mui/material/Box'
import { tokens } from '../../theme'

export type LegendMark = 'bar' | 'line' | 'dashed' | 'dot' | 'ring' | 'band'

export interface LegendItem {
  label: string
  /** Literal colour from `tokens` (metric colour, tint, or `tokens.chart.target`). */
  color: string
  /** Which mark the key mirrors. Default `bar`. */
  mark?: LegendMark
}

export interface LegendChipsProps {
  items: readonly LegendItem[]
  /** Smaller text and keys, for thumbnails and dense cards. */
  dense?: boolean
}

function Key({ color, mark = 'bar', dense }: { color: string; mark?: LegendMark; dense: boolean }) {
  const w = dense ? 12 : 14
  const h = dense ? 10 : 12
  return (
    <svg width={w} height={h} viewBox="0 0 14 12" aria-hidden focusable="false" style={{ flex: 'none' }}>
      {mark === 'bar' && <rect x="1" y="1" width="12" height="10" rx="3" fill={color} />}
      {mark === 'band' && <rect x="1" y="1" width="12" height="10" rx="3" fill={color} />}
      {mark === 'line' && (
        <line x1="1" y1="6" x2="13" y2="6" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      )}
      {mark === 'dashed' && (
        <line x1="0.5" y1="6" x2="13.5" y2="6" stroke={color} strokeWidth="2" strokeDasharray="3 2.5" />
      )}
      {mark === 'dot' && <circle cx="7" cy="6" r="4" fill={color} />}
      {mark === 'ring' && <circle cx="7" cy="6" r="3.75" fill="none" stroke={color} strokeWidth="1.5" />}
    </svg>
  )
}

export function LegendChips({ items, dense = false }: LegendChipsProps) {
  if (items.length === 0) return null
  return (
    <Box
      component="ul"
      aria-label="Legend"
      sx={{
        listStyle: 'none',
        m: 0,
        p: 0,
        display: 'flex',
        flexWrap: 'wrap',
        columnGap: dense ? 2.5 : 3.5,
        rowGap: 1,
      }}
    >
      {items.map((item) => (
        <Box
          component="li"
          key={item.label}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1.5,
            fontSize: dense ? tokens.font.size.caption : tokens.font.size.label,
            fontWeight: tokens.font.weight.label,
            color: tokens.ink.secondary,
            lineHeight: tokens.font.leading.label,
            letterSpacing: tokens.font.tracking.label,
          }}
        >
          <Key color={item.color} mark={item.mark} dense={dense} />
          {item.label}
        </Box>
      ))}
    </Box>
  )
}
