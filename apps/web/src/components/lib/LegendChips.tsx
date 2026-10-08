// Owns: the legend row under a chart title (2a): a small key that mirrors the mark — an 8 × 8 radius-2 square for a bar
// or band, a short stroke for a line or a dashed target, a dot, a ring — beside a 12 px muted label, 14 px apart.
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
  /** Which end of the row the keys pack to (a chart header's legend sits right). Default `start`. */
  align?: 'start' | 'end'
}

function Key({ color, mark = 'bar', dense }: { color: string; mark?: LegendMark; dense: boolean }) {
  const w = mark === 'line' || mark === 'dashed' ? (dense ? 10 : 12) : 8
  return (
    <svg width={w} height={8} viewBox={`0 0 ${w} 8`} aria-hidden focusable="false" style={{ flex: 'none' }}>
      {(mark === 'bar' || mark === 'band') && <rect x="0" y="0" width="8" height="8" rx={tokens.radius.bar} fill={color} />}
      {mark === 'line' && <line x1="0.75" y1="4" x2={w - 0.75} y2="4" stroke={color} strokeWidth="2" strokeLinecap="round" />}
      {mark === 'dashed' && <line x1="0" y1="4" x2={w} y2="4" stroke={color} strokeWidth="1.5" strokeDasharray="3 2" />}
      {mark === 'dot' && <circle cx="4" cy="4" r="4" fill={color} />}
      {mark === 'ring' && <circle cx="4" cy="4" r="3.25" fill="none" stroke={color} strokeWidth="1.5" />}
    </svg>
  )
}

export function LegendChips({ items, dense = false, align = 'start' }: LegendChipsProps) {
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
        justifyContent: align === 'end' ? 'flex-end' : undefined,
        columnGap: dense ? '10px' : '14px',
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
            gap: '5px',
            fontSize: dense ? tokens.font.size.micro : tokens.font.size.caption,
            fontWeight: tokens.font.weight.body,
            color: tokens.ink.secondary,
            lineHeight: tokens.font.leading.caption,
          }}
        >
          <Key color={item.color} mark={item.mark} dense={dense} />
          {item.label}
        </Box>
      ))}
    </Box>
  )
}
