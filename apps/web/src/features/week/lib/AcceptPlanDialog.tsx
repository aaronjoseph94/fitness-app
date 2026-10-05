// Owns: confirming a proposed week plan before it applies — who wrote it, the focus note, each day (kcal or fast,
// session), what it changes from last week, and Accept (POST /api/week-plans/:id/apply). Accepting sets that week's
// daily targets and planned sessions; it is one plan version, so it can be reverted.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import { endpoints } from '@fitness/shared/api'
import { addDays } from '@fitness/shared/engine'
import type { WeekPlan } from '@fitness/shared/schemas'
import { useApiQuery } from '../../../api'
import { formatNumber, formatShortDate, formatWeekday } from '../../../components'
import { tokens } from '../../../theme'
import { AUTHOR, Label, planDays } from './parts'
import { useApplyWeekPlan } from './useWeekPlan'

export interface AcceptPlanDialogProps {
  plan: WeekPlan
  open: boolean
  onClose: () => void
  /** Called after the plan applied. */
  onAccepted?: () => void
}

export function AcceptPlanDialog({ plan, open, onClose, onAccepted }: AcceptPlanDialogProps) {
  const view = useApiQuery(endpoints.weekPlans.get, { query: { week_start: plan.week_start } }, { enabled: open, staleTime: 60_000 })
  const apply = useApplyWeekPlan()
  const changes = !view.data
    ? null
    : view.data.proposed?.id === plan.id
      ? view.data.changes.proposed
      : view.data.active?.id === plan.id
        ? view.data.changes.active
        : []
  const range = `${formatShortDate(plan.week_start)} – ${formatShortDate(addDays(plan.week_start, 6))}`
  const accept = () =>
    apply.mutate(
      { params: { id: plan.id } },
      {
        onSuccess: () => {
          onAccepted?.()
          onClose()
        },
      },
    )

  return (
    <Dialog open={open} onClose={apply.isPending ? undefined : onClose} fullWidth maxWidth="xs" aria-labelledby="accept-week-plan-title">
      <DialogTitle id="accept-week-plan-title">Accept the plan for {range}?</DialogTitle>
      <DialogContent>
        <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>Proposed by {AUTHOR[plan.author]}</Box>
        {plan.plan.focus_note && <Box sx={{ mt: 2, fontSize: tokens.font.size.emphasis, lineHeight: 1.5 }}>{plan.plan.focus_note}</Box>}

        <Box component="ul" data-testid="accept-plan-days" sx={{ listStyle: 'none', m: 0, mt: 3, p: 0 }}>
          {planDays(plan).map((d) => (
            <Box
              component="li"
              key={d.date}
              sx={{ display: 'flex', gap: 2, py: 1, fontSize: tokens.font.size.small, '& + &': { borderTop: `1px solid ${tokens.ink.border}` } }}
            >
              <Box sx={{ width: 44, flex: 'none', fontWeight: tokens.font.weight.label }}>{formatWeekday(d.date)}</Box>
              <Box sx={{ width: 84, flex: 'none', fontVariantNumeric: 'tabular-nums' }}>{d.fast ? 'Fast' : `${formatNumber(d.kcal)} kcal`}</Box>
              <Box sx={{ minWidth: 0, color: d.session ? tokens.ink.text : tokens.ink.secondary, overflowWrap: 'anywhere' }}>
                {d.session?.name ?? 'Rest'}
                {d.scan ? ' · scan' : ''}
              </Box>
            </Box>
          ))}
        </Box>

        <Box sx={{ mt: 3 }}>
          <Label>What changes from last week</Label>
          {changes === null ? (
            <Box sx={{ mt: 1, fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>{view.isError ? 'Could not load the comparison.' : 'Loading…'}</Box>
          ) : changes.length === 0 ? (
            <Box sx={{ mt: 1, fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>Same targets and sessions as last week.</Box>
          ) : (
            <Box component="ul" sx={{ m: 0, mt: 1, pl: 4, fontSize: tokens.font.size.small, lineHeight: 1.6 }}>
              {changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </Box>
          )}
        </Box>

        <Box sx={{ mt: 3, fontSize: tokens.font.size.label, color: tokens.ink.secondary }}>
          Accepting sets that week’s daily targets and planned sessions. Water {formatNumber(plan.plan.water_ml)} ml · steps{' '}
          {formatNumber(plan.plan.steps)}. You can revert it from the week view on Progress.
        </Box>
        {apply.isError && (
          <Box role="alert" sx={{ mt: 2, fontSize: tokens.font.size.small, color: tokens.status.flag }}>
            {apply.error.message}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={apply.isPending}>
          Not now
        </Button>
        <Button variant="contained" onClick={accept} disabled={apply.isPending} data-testid="accept-week-plan">
          {apply.isPending ? 'Accepting…' : 'Accept plan'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
