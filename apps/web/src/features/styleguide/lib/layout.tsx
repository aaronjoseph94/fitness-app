// Owns: the styleguide's own layout pieces — a section (anchor + header + content), a responsive card grid,
// a plain white panel and a small caption — so the sections stay about what they show.
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import type { ReactNode } from 'react'
import { SectionHeader } from '../../../components'
import { tokens } from '../../../theme'

export interface SectionDef {
  id: string
  title: string
}

export function Section({
  id,
  title,
  subtitle,
  children,
}: SectionDef & { subtitle?: ReactNode; children: ReactNode }) {
  return (
    <Box component="section" sx={{ mt: 12 }} aria-labelledby={`${id}-title`}>
      <SectionHeader id={id} title={title} subtitle={subtitle} />
      {children}
    </Box>
  )
}

/** 1 column on phones, `md` columns from 900 px. */
export function Grid({ children, min = 300, gap = 4 }: { children: ReactNode; min?: number; gap?: number }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gap,
        gridTemplateColumns: {
          xs: 'minmax(0, 1fr)',
          sm: `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))`,
        },
        alignItems: 'start',
      }}
    >
      {children}
    </Box>
  )
}

export function Panel({ title, children, pad = 4 }: { title?: string; children: ReactNode; pad?: number }) {
  return (
    <Card sx={{ p: pad, minWidth: 0 }}>
      {title && <Caption sx={{ mb: 3 }}>{title}</Caption>}
      {children}
    </Card>
  )
}

export function Caption({ children, sx }: { children: ReactNode; sx?: object }) {
  return (
    <Box
      sx={{
        fontSize: tokens.font.size.label,
        fontWeight: tokens.font.weight.label,
        color: tokens.ink.secondary,
        lineHeight: 1.4,
        ...sx,
      }}
    >
      {children}
    </Box>
  )
}
