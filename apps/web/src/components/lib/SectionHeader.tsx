// Owns: the section title row used between groups of cards: the type scale's Title 2, an optional secondary line, and
// an optional action on the right. The gap it leaves under itself is deliberately smaller than the gap a page leaves
// *between* two sections, which is what makes a group read as a group (see `tokens.rhythm`).
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { tokens } from '../../theme'

export interface SectionHeaderProps {
  title: string
  subtitle?: ReactNode
  /** Right-aligned slot, e.g. a text button "See all". */
  action?: ReactNode
  /** Anchor id, so a page can link to the section; the title gets `${id}-title` for aria-labelledby. */
  id?: string
}

export function SectionHeader({ title, subtitle, action, id }: SectionHeaderProps) {
  return (
    <Box id={id} sx={{ display: 'flex', alignItems: 'flex-end', gap: 3, mb: 3, scrollMarginTop: tokens.layout.scrollPadding.top }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box
          component="h2"
          id={id ? `${id}-title` : undefined}
          sx={{
            m: 0,
            fontSize: tokens.font.size.sectionTitle,
            fontWeight: tokens.font.weight.heading,
            lineHeight: tokens.font.leading.sectionTitle,
            letterSpacing: tokens.font.tracking.sectionTitle,
            color: tokens.ink.text,
          }}
        >
          {title}
        </Box>
        {subtitle && (
          <Box
            sx={{
              mt: 0.5,
              fontSize: tokens.font.size.small,
              color: tokens.ink.secondary,
              lineHeight: tokens.font.leading.small,
              letterSpacing: tokens.font.tracking.small,
            }}
          >
            {subtitle}
          </Box>
        )}
      </Box>
      {action && <Box sx={{ flex: 'none' }}>{action}</Box>}
    </Box>
  )
}
