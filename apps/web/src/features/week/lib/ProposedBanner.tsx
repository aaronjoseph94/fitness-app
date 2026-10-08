// Owns: one proposed week plan waiting for a tap (2a info strip: the accent tint, a blue hairline, radius 10) — the
// week, who proposed it, and Review, which opens the Accept dialog. The caller spaces it.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { addDays } from '@fitness/shared/engine'
import type { WeekPlan } from '@fitness/shared/schemas'
import { useState } from 'react'
import { formatShortDate } from '../../../components'
import { tokens } from '../../../theme'
import { AcceptPlanDialog } from './AcceptPlanDialog'
import { AUTHOR } from './parts'

export function ProposedBanner({ plan }: { plan: WeekPlan }) {
  const [open, setOpen] = useState(false)
  const range = `${formatShortDate(plan.week_start)} – ${formatShortDate(addDays(plan.week_start, 6))}`
  return (
    <Box
      data-testid="week-plan-proposed"
      sx={{
        py: '10px',
        px: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        borderRadius: `${tokens.radius.panel}px`,
        border: `1px solid ${tokens.accent.border}`,
        bgcolor: tokens.accent.soft,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, fontWeight: tokens.font.weight.heading, color: tokens.ink.text }}>
          New plan for {range}
        </Box>
        <Box sx={{ fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.caption, color: tokens.ink.secondary }}>
          Proposed by {AUTHOR[plan.author]}
        </Box>
      </Box>
      <Button variant="outlined" size="small" onClick={() => setOpen(true)} sx={{ flex: 'none' }}>
        Review
      </Button>
      {open && <AcceptPlanDialog plan={plan} open onClose={() => setOpen(false)} />}
    </Box>
  )
}
