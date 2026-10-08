// Owns: one Dashboard section — a titled block of cards (2a: a 16/600 title with its 13 px muted description on the
// same baseline, then the section's own board of cards). On a phone it folds behind its heading (so the page reads as
// a short list and each section opens on a tap); from `md` up it is always open. Each section lays out its own board
// with the shared `Columns`/`Column` pair, because 2a weights them differently (1.6 : 1 : 1, or four equal cards).
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Box from '@mui/material/Box'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import type { ReactNode } from 'react'
import { cardSurface, SectionHeader } from '../../../components'
import { tokens } from '../../../theme'

/**
 * 2a's 1.6 : 1 : 1 row as whole tracks: an 18-track board where the wide card takes 8 and the two beside it take 5
 * each (8 : 5 : 5 = 1.6 : 1 : 1), so the row is the kit's `Columns` rather than a hand-written grid template.
 */
export const WIDE_ROW = { tracks: 18, wide: 8, narrow: 5, half: 9 } as const

export interface DashboardSectionProps {
  /** Anchor id; the title gets `${id}-title` for aria-labelledby. */
  id: string
  title: string
  subtitle?: ReactNode
  /** Whether the section starts open on a phone. Ignored on desktop, where it is always open. */
  defaultOpen?: boolean
  children: ReactNode
}

export function DashboardSection({ id, title, subtitle, defaultOpen = false, children }: DashboardSectionProps) {
  const theme = useTheme()
  const desktop = useMediaQuery(theme.breakpoints.up('md'))

  if (desktop)
    return (
      <Box component="section" aria-labelledby={`${id}-title`} data-testid={`dashboard-${id}`}>
        <SectionHeader id={id} title={title} subtitle={subtitle} />
        {children}
      </Box>
    )

  return (
    <Accordion
      defaultExpanded={defaultOpen}
      disableGutters
      elevation={0}
      data-testid={`dashboard-${id}`}
      // The open panel is a region named by the section's title, so two open sections are two distinct landmarks.
      slotProps={{ region: { 'aria-labelledby': `${id}-title` } }}
      // The 2a card (hairline, radius 12, the card whisper); `&::before` is MUI's own top rule, which 2a does not draw.
      sx={{ ...cardSurface, overflow: 'hidden', '&::before': { display: 'none' } }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreRounded />}
        sx={{ minHeight: tokens.tapTarget, px: `${tokens.pad.card.x}px`, py: 1, '& .MuiAccordionSummary-content': { my: '14px' } }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Box
            component="h2"
            id={`${id}-title`}
            sx={{ m: 0, fontSize: tokens.font.size.sectionTitle, fontWeight: tokens.font.weight.heading, lineHeight: tokens.font.leading.sectionTitle, color: tokens.ink.text }}
          >
            {title}
          </Box>
          {subtitle && (
            <Box sx={{ mt: '2px', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.secondary }}>{subtitle}</Box>
          )}
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 3, pt: 1, pb: 3 }}>{children}</AccordionDetails>
    </Accordion>
  )
}
