// Owns: the Log tab's rail card (2a) — the kit's dense `Panel` with a 14/600 title led by an 18 px glyph and a short
// meta line or control on the right (Water, Sleep and steps, Measurements, Fasting, Favourites) — and the loading rows.
import Box from '@mui/material/Box'
import Skeleton from '@mui/material/Skeleton'
import type SvgIcon from '@mui/material/SvgIcon'
import type { ReactNode } from 'react'
import { Panel } from '../../../components'
import { tokens } from '../../../theme'

interface LogCardProps {
  title: string
  icon: typeof SvgIcon
  /** The glyph's token colour (a metric's, or the muted ink). */
  iconColor?: string
  /** Right of the title: a 12 px meta line, a chip, a link button. */
  meta?: ReactNode
  children: ReactNode
  testId?: string
}

export function LogCard({ title, icon: Icon, iconColor = tokens.ink.secondary, meta, children, testId }: LogCardProps) {
  return (
    <Panel
      titleSize="card"
      padding="dense"
      title={
        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Icon aria-hidden sx={{ fontSize: 18, color: iconColor, flex: 'none' }} />
          {title}
        </Box>
      }
      actions={meta}
      testId={testId}
    >
      {children}
    </Panel>
  )
}

/** A rail card's 12 px meta line (right of its title). */
export function CardMeta({ children }: { children: ReactNode }) {
  return <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary, fontVariantNumeric: 'tabular-nums' }}>{children}</Box>
}

/** Placeholder rows while a list loads; `height` per row (default 40). */
export function LoadingRows({ rows = 2, height = 40 }: { rows?: number; height?: number }) {
  return (
    <Box sx={{ display: 'grid', gap: 2 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} variant="rounded" height={height} />
      ))}
    </Box>
  )
}
