// Owns: one Dashboard section (1d) — a titled group of cards: an Outfit 24 px `h2` with its 13 px muted description,
// 40 px above it and 14 px under it, then the section's own wrapping rows of cards. A detail section folds behind its
// heading on a phone (a white radius-30 card that opens on a tap, so the page reads as a short list); `fold={false}`
// keeps it open at every width (Training, as 1d draws it). From `md` up every section is always open.
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Box from '@mui/material/Box'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import type { ReactNode } from 'react'
import { cardSurface, displayTitle, SectionHeader } from '../../../components'
import { tokens } from '../../../theme'

/** 1d: a section heading sits 40 px under the row above it (the page's rows are 26 px apart). */
const HEADING_GAP = 40 - tokens.rhythm.section

export interface DashboardSectionProps {
  /** Anchor id; the title gets `${id}-title` for aria-labelledby. */
  id: string
  title: string
  subtitle?: ReactNode
  /** Whether the section starts open on a phone. Ignored on desktop, where it is always open. */
  defaultOpen?: boolean
  /** Fold behind its heading on a phone. Default true; false keeps it open at every width. */
  fold?: boolean
  children: ReactNode
}

export function DashboardSection({
  id,
  title,
  subtitle,
  defaultOpen = false,
  fold = true,
  children,
}: DashboardSectionProps) {
  const theme = useTheme()
  const desktop = useMediaQuery(theme.breakpoints.up('md'))

  if (desktop || !fold)
    return (
      <Box
        component="section"
        aria-labelledby={`${id}-title`}
        data-testid={`dashboard-${id}`}
        sx={{ mt: `${HEADING_GAP}px`, minWidth: 0 }}
      >
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
      // APG accordion: the section's h2 wraps the toggle button (MUI's default heading slot is an h3), so the title
      // inside is a plain span. The open panel is a region named by that title, so two open sections are two landmarks.
      slotProps={{ heading: { component: 'h2' }, region: { 'aria-labelledby': `${id}-title` } }}
      // The 1d card (radius 30, the soft violet shadow); `&::before` is MUI's own top rule, which 1d does not draw. An
      // open section's cards sit on the cream inside it, so they keep their own white and shadow.
      sx={{
        ...cardSurface,
        overflow: 'hidden',
        '&::before': { display: 'none' },
        '&.Mui-expanded': { bgcolor: tokens.ink.page, boxShadow: 'none' },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreRounded />}
        // The ring goes inset (as on the kit's flush rows): the card's overflow:hidden would clip an outset one.
        sx={{
          minHeight: tokens.tapTarget,
          px: `${tokens.pad.card.x}px`,
          py: 1,
          '& .MuiAccordionSummary-content': { my: '16px' },
          '&.Mui-focusVisible': { outlineOffset: -tokens.focusRing.width },
          '&.Mui-expanded': { px: 0 },
        }}
      >
        <Box component="span" sx={{ display: 'block', minWidth: 0 }}>
          <Box
            component="span"
            id={`${id}-title`}
            sx={{ display: 'block', ...displayTitle('section'), color: tokens.ink.text }}
          >
            {title}
          </Box>
          {subtitle && (
            <Box
              component="span"
              sx={{
                display: 'block',
                mt: '2px',
                fontSize: tokens.font.size.small,
                lineHeight: tokens.font.leading.small,
                color: tokens.ink.secondary,
              }}
            >
              {subtitle}
            </Box>
          )}
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 0, pt: '4px', pb: '4px' }}>{children}</AccordionDetails>
    </Accordion>
  )
}
