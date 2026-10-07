// Owns: one Dashboard section — a titled block of chart panels. On a phone it folds behind its heading (so the page
// reads as a short list and each section opens on a tap); from `md` up it is always open and lays its panels out in
// columns, which is what turns the desktop view into a board rather than one long scroll. The board itself is the
// shared `Columns`/`Column` pair every page uses.
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Box from '@mui/material/Box'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import type { ReactNode } from 'react'
import { Column, Columns, SectionHeader } from '../../../components'
import { tokens } from '../../../theme'

/**
 * A panel's weight on the section board. The board has 12 tracks at `lg` and 6 at `md`, so a row of panels adds up to
 * 12 (and to 6 at `md`) when the spans are chosen together — a row that does not add up leaves a hole, which is what
 * makes a board look unfinished.
 */
export type PanelSpan = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

/** One panel in a section: how many of the board's tracks it takes (clamped to the board's own count). */
export function Panel({
  span = 1,
  mdSpan,
  xsSpan,
  smSpan,
  rowSpan,
  children,
}: {
  span?: PanelSpan
  /** Tracks from `md` up only. Defaults to a share of the row that keeps the same weight as `span`. */
  mdSpan?: number
  /** Tracks on a phone (and at `sm` unless `smSpan`). Default 1 (two panels across a phone board). */
  xsSpan?: number
  smSpan?: number
  rowSpan?: number
  children: ReactNode
}) {
  return (
    <Column span={span} mdSpan={mdSpan ?? span} xsSpan={xsSpan} smSpan={smSpan} rowSpan={rowSpan}>
      {children}
    </Column>
  )
}

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
  // 12 tracks at `lg` and 6 at `md`: a section is a bento of panels of different weights, not a row of equal cards.
  // A phone keeps the single column it always had, so the panels stack in reading order there.
  const board = (
    <Columns md={6} lg={12} gap={4}>
      {children}
    </Columns>
  )

  if (desktop)
    return (
      <Box component="section" aria-labelledby={`${id}-title`} data-testid={`dashboard-${id}`}>
        <SectionHeader id={id} title={title} subtitle={subtitle} />
        {board}
      </Box>
    )

  return (
    <Accordion
      defaultExpanded={defaultOpen}
      disableGutters
      elevation={0}
      data-testid={`dashboard-${id}`}
      // A white card on the grouped grey needs no outline: the surface contrast is the separation (and `&::before`
      // is MUI's own top hairline, which the HIG would not draw here).
      sx={{
        bgcolor: tokens.ink.card,
        borderRadius: `${tokens.radius.card}px`,
        boxShadow: tokens.elevation.card,
        overflow: 'hidden',
        '&::before': { display: 'none' },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreRounded />}
        sx={{ minHeight: tokens.tapTarget, px: 4, py: 2, '& .MuiAccordionSummary-content': { my: 2 } }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Box
            component="h2"
            id={`${id}-title`}
            sx={{
              m: 0,
              fontSize: tokens.font.size.cardTitle,
              fontWeight: tokens.font.weight.heading,
              lineHeight: tokens.font.leading.cardTitle,
              letterSpacing: tokens.font.tracking.cardTitle,
            }}
          >
            {title}
          </Box>
          {subtitle && (
            <Box
              sx={{
                mt: 0.5,
                fontSize: tokens.font.size.label,
                color: tokens.ink.secondary,
                lineHeight: tokens.font.leading.label,
                letterSpacing: tokens.font.tracking.label,
              }}
            >
              {subtitle}
            </Box>
          )}
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 3, pt: 2, pb: 4 }}>{board}</AccordionDetails>
    </Accordion>
  )
}
