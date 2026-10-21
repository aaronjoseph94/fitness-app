// Owns: the 1d section title row between groups of cards — an Outfit 400 24 px `h2` with its 13 px muted description
// running after it on the same baseline (wrapping under it when narrow), and optional actions on the right ("+ New
// template"). It leaves 14 px under itself, less than the 26 px a page leaves between rows, which is what makes a group
// read as a group.
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { tokens } from '../../theme'
import { displayTitle } from './surfaces'

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
    <Box
      id={id}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        mb: '14px',
        minWidth: 0,
        scrollMarginTop: tokens.layout.scrollPadding.top,
      }}
    >
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          columnGap: '10px',
          rowGap: '2px',
        }}
      >
        <Box
          component="h2"
          id={id ? `${id}-title` : undefined}
          sx={{ m: 0, ...displayTitle('section'), color: tokens.ink.text }}
        >
          {title}
        </Box>
        {subtitle && (
          <Box
            sx={{
              fontSize: tokens.font.size.small,
              lineHeight: tokens.font.leading.small,
              color: tokens.ink.secondary,
              minWidth: 0,
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
