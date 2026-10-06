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

export type PanelSpan = 1 | 2 | 3

/** One panel in a section: how many of the board's columns it takes (clamped to the board's own count). */
export function Panel({ span = 1, children }: { span?: PanelSpan; children: ReactNode }) {
  return <Column span={span}>{children}</Column>
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
  const board = (
    <Columns md={2} lg={3}>
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
      sx={{
        bgcolor: tokens.ink.card,
        border: `1px solid ${tokens.ink.border}`,
        borderRadius: `${tokens.radius.card}px`,
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
            sx={{ m: 0, fontSize: tokens.font.size.sectionTitle, fontWeight: tokens.font.weight.heading, lineHeight: 1.3 }}
          >
            {title}
          </Box>
          {subtitle && (
            <Box sx={{ mt: 0.5, fontSize: tokens.font.size.small, color: tokens.ink.secondary, lineHeight: 1.45 }}>{subtitle}</Box>
          )}
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 3, pt: 2, pb: 4 }}>{board}</AccordionDetails>
    </Accordion>
  )
}
