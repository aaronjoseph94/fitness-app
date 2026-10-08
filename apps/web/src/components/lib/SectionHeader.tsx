// Owns: the 2a section title row between groups of cards — a 16/600 `h2` with its 13 px muted description running
// after it on the same baseline (wrapping under it when narrow), and optional actions on the right ("+ New template").
// It leaves 12 px under itself, less than the 20–24 px a page leaves between sections, which is what makes a group read
// as a group.
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { tokens } from '../../theme'

export interface SectionHeaderProps {
  title: string
  /** The 13 px muted description beside the title. */
  subtitle?: ReactNode
  /** Right-aligned slot, e.g. a text button "See all". */
  action?: ReactNode
  /** Anchor id, so a page can link to the section; the title gets `${id}-title` for aria-labelledby. */
  id?: string
}

export function SectionHeader({ title, subtitle, action, id }: SectionHeaderProps) {
  return (
    <Box id={id} sx={{ display: 'flex', alignItems: 'center', gap: 3, mb: '12px', minWidth: 0, scrollMarginTop: tokens.layout.scrollPadding.top }}>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: '10px', rowGap: '2px' }}>
        <Box
          component="h2"
          id={id ? `${id}-title` : undefined}
          sx={{
            m: 0,
            fontSize: tokens.font.size.sectionTitle,
            fontWeight: tokens.font.weight.heading,
            lineHeight: tokens.font.leading.sectionTitle,
            color: tokens.ink.text,
          }}
        >
          {title}
        </Box>
        {subtitle && (
          <Box sx={{ fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.secondary, minWidth: 0 }}>
            {subtitle}
          </Box>
        )}
      </Box>
      {action && <Box sx={{ flex: 'none' }}>{action}</Box>}
    </Box>
  )
}
