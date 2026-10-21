// Owns: the legend row under a chart title (1d): a small key that mirrors the mark — a 10 × 10 radius-3 square for a
// bar or band, a short stroke for a line or a dashed target, a dot, a ring — beside a 12 px muted label, 12 px apart.
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
  const box = dense ? 8 : 10
  const w = mark === 'line' || mark === 'dashed' ? (dense ? 10 : 14) : box
  const mid = box / 2
  return (
    <svg
      width={w}
      height={box}
      viewBox={`0 0 ${w} ${box}`}
      aria-hidden
      focusable="false"
      style={{ flex: 'none' }}
    >
      {(mark === 'bar' || mark === 'band') && (
        <rect x="0" y="0" width={box} height={box} rx={3} fill={color} />
      )}
      {mark === 'line' && (
        <line x1="1" y1={mid} x2={w - 1} y2={mid} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      )}
      {mark === 'dashed' && (
        <line x1="0" y1={mid} x2={w} y2={mid} stroke={color} strokeWidth="2" strokeDasharray="4 2" />
      )}
      {mark === 'dot' && <circle cx={mid} cy={mid} r={mid} fill={color} />}
      {mark === 'ring' && (
        <circle cx={mid} cy={mid} r={mid - 1} fill="none" stroke={color} strokeWidth="1.75" />
      )}
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
        columnGap: dense ? '10px' : '12px',
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
            fontWeight: tokens.font.weight.label,
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
