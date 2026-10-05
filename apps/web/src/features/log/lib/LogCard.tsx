// Owns: the Log tab's card frame — title, a quiet subtitle, an optional badge and action on the right — with an
// optional collapsed state for the weekly and occasional sections (measurements, favourites), and the loading rows.
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Card from '@mui/material/Card'
import Collapse from '@mui/material/Collapse'
import Skeleton from '@mui/material/Skeleton'
import { useState, type ReactNode } from 'react'
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
  const heading = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: tokens.tapTarget, width: '100%', textAlign: 'left' }}>
      {color && <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: tokens.radius.chip, bgcolor: color, flex: 'none' }} />}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box component="h3" sx={{ m: 0, fontSize: 17, fontWeight: tokens.font.weight.heading, lineHeight: 1.3 }}>
          {title}
        </Box>
        {subtitle && <Box sx={{ fontSize: tokens.font.size.label, color: 'text.secondary', lineHeight: 1.4, mt: 0.25 }}>{subtitle}</Box>}
      </Box>
      {badge}
      {collapsible && (
        <ExpandMoreRounded aria-hidden sx={{ color: 'text.secondary', transition: 'transform 200ms', transform: open ? 'rotate(180deg)' : 'none' }} />
      )}
    </Box>
  )
  return (
    <Card component="section" data-testid={testId} sx={{ px: 4, pt: 2, pb: open ? 4 : 2, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {collapsible ? (
          <ButtonBase onClick={() => setOpen((o) => !o)} aria-expanded={open} sx={{ flex: 1, minWidth: 0, borderRadius: 2, font: 'inherit', color: 'inherit' }}>
            {heading}
          </ButtonBase>
        ) : (
          <Box sx={{ flex: 1, minWidth: 0 }}>{heading}</Box>
        )}
        {action && <Box sx={{ flex: 'none' }}>{action}</Box>}
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ pt: 2 }}>{children}</Box>
      </Collapse>
    </Card>
  )
}

export function LoadingRows({ rows = 2 }: { rows?: number }) {
  return (
    <Box sx={{ display: 'grid', gap: 2 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} variant="rounded" height={40} />
      ))}
    </Box>
  )
}
