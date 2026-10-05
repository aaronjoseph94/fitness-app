// Owns: the Log tab's card frame — title, a quiet subtitle, an optional badge and action on the right — with an
// optional collapsed state for the weekly and occasional sections (measurements, favourites), and the loading rows.
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Card from '@mui/material/Card'
import Collapse from '@mui/material/Collapse'
import Skeleton from '@mui/material/Skeleton'
import { useId, useState, type ReactNode } from 'react'
import { tokens } from '../../../theme'

interface LogCardProps {
  title: string
  subtitle?: ReactNode
  badge?: ReactNode
  action?: ReactNode
  /** Starts collapsed; the header toggles it. */
  collapsible?: boolean
  /** Metric colour dot before the title. */
  color?: string
  children: ReactNode
  testId?: string
}

export function LogCard({ title, subtitle, badge, action, collapsible = false, color, children, testId }: LogCardProps) {
  const [open, setOpen] = useState(!collapsible)
  const subtitleId = useId()
  const row = { display: 'flex', alignItems: 'center', gap: 2, minHeight: tokens.tapTarget, width: '100%', textAlign: 'left' } as const
  const dot = color && <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: tokens.radius.chip, bgcolor: color, flex: 'none' }} />
  const sublineSx = { display: 'block', fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.body, color: 'text.secondary', lineHeight: 1.4, mt: 0.25 } as const
  const subline = subtitle && <Box sx={sublineSx}>{subtitle}</Box>
  const headingSx = { m: 0, fontSize: 17, fontWeight: tokens.font.weight.heading, lineHeight: 1.3 } as const
  // A collapsible card's toggle sits inside its heading (not the heading inside a button), so the heading stays in
  // the page outline, named by the title alone. The subtitle shows inside the button, hidden from the name and read as
  // the button's description instead.
  const header = collapsible ? (
    <Box component="h2" sx={{ ...headingSx, flex: 1, minWidth: 0 }}>
      <ButtonBase
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-describedby={subtitle ? subtitleId : undefined}
        sx={{ ...row, borderRadius: 2, font: 'inherit', color: 'inherit' }}
      >
        {dot}
        <Box component="span" sx={{ flex: 1, minWidth: 0, display: 'block' }}>
          {title}
          {subtitle && (
            <Box component="span" id={subtitleId} aria-hidden sx={sublineSx}>
              {subtitle}
            </Box>
          )}
        </Box>
        {badge}
        <ExpandMoreRounded aria-hidden sx={{ color: 'text.secondary', transition: 'transform 200ms', transform: open ? 'rotate(180deg)' : 'none' }} />
      </ButtonBase>
    </Box>
  ) : (
    <Box sx={{ ...row, flex: 1, minWidth: 0 }}>
      {dot}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box component="h2" sx={headingSx}>
          {title}
        </Box>
        {subline}
      </Box>
      {badge}
    </Box>
  )
  return (
    <Card component="section" data-testid={testId} sx={{ px: 4, pt: 2, pb: open ? 4 : 2, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {header}
        {action && <Box sx={{ flex: 'none' }}>{action}</Box>}
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ pt: 2 }}>{children}</Box>
      </Collapse>
    </Card>
  )
}

/** Placeholder rows while a list loads; `height` per row (default 40), e.g. a meal card's. */
export function LoadingRows({ rows = 2, height = 40 }: { rows?: number; height?: number }) {
  return (
    <Box sx={{ display: 'grid', gap: 2 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} variant="rounded" height={height} />
      ))}
    </Box>
  )
}
