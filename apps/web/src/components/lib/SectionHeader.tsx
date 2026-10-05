// Owns: the section title row used between groups of cards: 20 px title, optional secondary line, optional action on the right.
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
    <Box id={id} sx={{ display: 'flex', alignItems: 'flex-end', gap: 3, mb: 3, scrollMarginTop: 72 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box
          component="h2"
          id={id ? `${id}-title` : undefined}
          sx={{
            m: 0,
            fontSize: tokens.font.size.sectionTitle,
            fontWeight: tokens.font.weight.heading,
            lineHeight: 1.3,
            color: tokens.ink.text,
          }}
        >
          {title}
        </Box>
        {subtitle && (
          <Box sx={{ mt: 0.5, fontSize: 14, color: tokens.ink.secondary, lineHeight: 1.45 }}>{subtitle}</Box>
        )}
      </Box>
      {action && <Box sx={{ flex: 'none' }}>{action}</Box>}
    </Box>
  )
}
