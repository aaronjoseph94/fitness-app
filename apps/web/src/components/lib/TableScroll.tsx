// Owns: README §4's table rule — a table (meal items, segments, every scan) sits in an `overflow-x: auto` wrapper with
// a 520 px minimum width inside, so on a phone it scrolls sideways within its card and the page never does. Given a
// name, the wrapper is a focusable region, so a keyboard can scroll it too (WCAG 2.1.1).
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { tokens } from '../../theme'

export interface TableScrollProps {
  children: ReactNode
  /** The inner minimum width, px. Default 520. */
  minWidth?: number
  /** Names the scroll region (and makes it focusable), e.g. "Meal items". */
  ariaLabel?: string
  testId?: string
}

export function TableScroll({
  children,
  minWidth = tokens.layout.tableMin,
  ariaLabel,
  testId,
}: TableScrollProps) {
  return (
    <Box
      role={ariaLabel ? 'region' : undefined}
      aria-label={ariaLabel}
      tabIndex={ariaLabel ? 0 : undefined}
      data-testid={testId}
      sx={{
        overflowX: 'auto',
        overscrollBehaviorX: 'contain',
        minWidth: 0,
        maxWidth: '100%',
        '&:focus-visible': {
          outline: `${tokens.focusRing.width}px solid ${tokens.focusRing.color}`,
          outlineOffset: tokens.focusRing.offset,
        },
      }}
    >
      <Box sx={{ minWidth }}>{children}</Box>
    </Box>
  )
}
