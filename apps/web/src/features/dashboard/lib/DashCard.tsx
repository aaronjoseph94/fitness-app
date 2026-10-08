// Owns: the Dashboard's section card (2a): a white card padded 18 × 20 that fills its board cell, with a 14/600 title,
// a 12 px muted description under it and a small right-hand slot ("target 9,000", a legend, a picker), then the card's
// body, then an optional 12 px caption pinned to the bottom so captions line up across a row of cards of different
// content heights — or the 2a empty slot in place of the body when there is nothing to draw. It is the kit's card
// surface and `EmptyState`; `ChartCard` has no small-title size, fill-height or pinned caption (reported for the kit).
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { cardSurface, EmptyState, type EmptyStateProps } from '../../../components'
import { tokens } from '../../../theme'

export interface DashCardProps {
  title: string
  subtitle?: ReactNode
  /** Right of the title: a short muted note, a legend or a control. */
  action?: ReactNode
  /** When set, the empty slot replaces the body and the caption. */
  empty?: Omit<EmptyStateProps, 'compact'> | null | false
  /** The 12 px caption at the bottom of the card. */
  caption?: ReactNode
  children?: ReactNode
  testId?: string
}

export function DashCard({ title, subtitle, action, empty, caption, children, testId }: DashCardProps) {
  return (
    <Box
      data-testid={testId}
      sx={{
        ...cardSurface,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        px: `${tokens.pad.card.x}px`,
        py: `${tokens.pad.card.y}px`,
        minWidth: 0,
        breakInside: 'avoid',
      }}
    >
      {/* The title and the right-hand slot share a baseline; the description runs the card's full width under both. */}
      <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 12px' }}>
        <Box component="h3" sx={{ flex: '1 1 auto', minWidth: 0, m: 0, fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.heading, lineHeight: tokens.font.leading.body, color: tokens.ink.text }}>
          {title}
        </Box>
        {action && (
          <Box sx={{ flex: 'none', ml: 'auto', display: 'flex', alignItems: 'center', fontSize: tokens.font.size.caption, color: tokens.ink.secondary }}>
            {action}
          </Box>
        )}
      </Box>
      {subtitle && (
        <Box sx={{ mt: '2px', fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.caption, color: tokens.ink.secondary }}>{subtitle}</Box>
      )}
      {empty ? (
        <Box sx={{ mt: 4 }}>
          <EmptyState {...empty} compact />
        </Box>
      ) : (
        <>
          <Box sx={{ mt: 4, minWidth: 0 }}>{children}</Box>
          {caption && (
            <Box sx={{ mt: 'auto', pt: '10px', fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.caption, color: tokens.ink.secondary }}>
              {caption}
            </Box>
          )}
        </>
      )}
    </Box>
  )
}
