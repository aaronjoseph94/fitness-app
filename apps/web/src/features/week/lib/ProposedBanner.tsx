// Owns: one proposed week plan waiting for a tap — the week, who proposed it, and Review, which opens the Accept dialog.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { addDays } from '@fitness/shared/engine'
import type { WeekPlan } from '@fitness/shared/schemas'
import { useState } from 'react'
import { formatShortDate } from '../../../components'
import { tokens, withAlpha } from '../../../theme'
import { AcceptPlanDialog } from './AcceptPlanDialog'
import { AUTHOR } from './parts'

export function ProposedBanner({ plan }: { plan: WeekPlan }) {
  const [open, setOpen] = useState(false)
  const range = `${formatShortDate(plan.week_start)} – ${formatShortDate(addDays(plan.week_start, 6))}`
  return (
    <Box
      data-testid="week-plan-proposed"
      sx={{
        mt: 3,
        p: 3,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        borderRadius: `${tokens.radius.control}px`,
        bgcolor: withAlpha(tokens.metric.weight, 0.06),
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: 15, fontWeight: tokens.font.weight.label }}>New plan for {range}</Box>
        <Box sx={{ fontSize: 13, color: tokens.ink.secondary }}>Proposed by {AUTHOR[plan.author]}</Box>
      </Box>
      <Button variant="outlined" onClick={() => setOpen(true)} sx={{ minHeight: tokens.tapTarget, flex: 'none' }}>
        Review
      </Button>
      {open && <AcceptPlanDialog plan={plan} open onClose={() => setOpen(false)} />}
    </Box>
  )
}
