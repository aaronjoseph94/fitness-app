// Owns: README §4's rule "multi-column rows wrap; they never squeeze" — `WrapRow` (a `display:flex; flex-wrap:wrap`
// row with the page gap) and the two column recipes for its children: `wrapCol(ratio, basis)` for a fraction column
// (`flex: <ratio×100> 1 <ratio×basis>px`, so the desktop ratios hold exactly and a row wraps once the bases no longer
// fit) and `fixedCol(px)` for a fixed side column (`flex: 1 1 <px>px`). Both set `min-width: 0` so text inside can
// shrink. Use these instead of a fixed grid of breakpoint columns, which snap at different widths.
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { tokens } from '../../theme'

/**
 * A fraction column: `flex: <ratio × 100> 1 <ratio × basis>px`. `basis` is README §4's X — 280 by default, 150 for
 * 4–5-up tiles (`tokens.layout.wrapBasis.tile`), or a screen's own (Log's day header: 260). E.g. Today's fuel card :
 * coach column is `wrapCol(1.45)` : `wrapCol(1)`; README's `flex: '160 1 448px'` is `wrapCol(1.6)`.
 */
export function wrapCol(ratio: number, basis: number = tokens.layout.wrapBasis.column) {
  return { flex: `${Math.round(ratio * 100)} 1 ${Math.round(ratio * basis)}px`, minWidth: 0 } as const
}

/** A fixed side column (Settings' 220 px nav, Session's 320 px rail): `flex: 1 1 <px>px`. */
export function fixedCol(px: number) {
  return { flex: `1 1 ${px}px`, minWidth: 0 } as const
}

export interface WrapRowProps {
  children?: ReactNode
  /** Gap in px. Default 26 (rows of cards); 18 between tiles. */
  gap?: number
  /** Cross-axis alignment. Default `stretch` (cards in a row end level); `flex-start` lets each keep its height. */
  align?: 'stretch' | 'flex-start' | 'center' | 'flex-end'
  component?: 'div' | 'section' | 'ul'
  ariaLabel?: string
  testId?: string
}

export function WrapRow({
  children,
  gap = tokens.rhythm.section,
  align = 'stretch',
  component = 'div',
  ariaLabel,
  testId,
}: WrapRowProps) {
  return (
    <Box
      component={component}
      aria-label={ariaLabel}
      data-testid={testId}
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: align,
        gap: `${gap}px`,
        minWidth: 0,
        ...(component === 'ul' && { listStyle: 'none', m: 0, p: 0 }),
      }}
    >
      {children}
    </Box>
  )
}
