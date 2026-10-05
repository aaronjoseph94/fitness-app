// Owns: the full week view on Progress (SPEC §8, §11 "Week plan vs actuals") — pick a week (‹ ›), its plan (status,
// author, focus note, water, steps, scan date), the planned-vs-eaten chart with session marks, each day's targets and
// session with a mini muscle map beside last week's actuals for the same weekday, what changed from last week, a
// proposed plan's Review → Accept, and Revert for the active plan of a week not yet over.
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import { addDays, weekStart } from '@fitness/shared/engine'
import { Weekday, type LocalDate, type WeekDayActual, type WeekPlan, type WeekPlanView } from '@fitness/shared/schemas'
import { useState } from 'react'
import { WeekPlanVsActualChart, type PlanDay, type SessionStatus } from '../../../charts'
import { formatNumber, formatShortDate, formatWeekday } from '../../../components'
import { tokens } from '../../../theme'
import { Label, PlanBadge, planDays, sessionDetail, SessionThumb } from './parts'
import { ProposedBanner } from './ProposedBanner'
import { useRevertWeekPlan, useWeekPlan } from './useWeekPlan'

const MINI_MAP = 56

export interface WeekViewProps {
  /** Today (America/Edmonton); the view opens on its week. */
  date: LocalDate
}

/** Session mark per day: done when a session was finished, else planned (ahead) or missed (past), else rest. */
function sessionStatus(planned: boolean, d: WeekDayActual | undefined, today: LocalDate, date: LocalDate): SessionStatus {
  if ((d?.sessions_done ?? 0) > 0) return 'done'
  if (!planned) return 'rest'
  return date < today ? 'missed' : 'planned'
}

/** The chart's seven days: the plan's kcal (0 on a fast day) or the materialised target, and what was eaten so far. */
function chartDays(view: WeekPlanView, plan: WeekPlan | null, today: LocalDate): PlanDay[] {
  return Weekday.options.map((w, i) => {
    const date = addDays(view.week_start, i)
    const d = view.days[i]
    const fast = plan ? plan.plan.fast_dates.includes(date) : (d?.is_fast_day ?? false)
    const planned = plan ? plan.plan.sessions[w] !== null : (d?.training_planned ?? false)
    return {
      day: formatWeekday(date),
      plannedKcal: plan ? (fast ? 0 : plan.plan.targets[w].kcal) : (d?.target_kcal ?? null),
      eatenKcal: date <= today && d ? d.intake_kcal : null,
      session: sessionStatus(planned, d, today, date),
      fast,
    }
  })
}

/** Last week's same weekday: eaten kcal (or fast / not logged) and whether the session happened; days still ahead (when
 * the shown week is next week) show only what is planned. */
function LastWeek({ d, today }: { d: WeekDayActual | undefined; today: LocalDate }) {
  if (!d || (d.target_kcal === null && d.meals_logged === 0)) return <Box sx={{ color: tokens.ink.secondary }}>—</Box>
  const ahead = d.date > today
  // The fast day itself, or a day a fast overlapped with nothing eaten. A fast begun at 19:00 overlaps that day too, but
  // the lunch and dinner eaten before it are what the day shows.
  const food =
    d.is_fast_day || (d.fasted && d.meals_logged === 0)
      ? 'Fast'
      : ahead
        ? 'Ahead'
        : d.meals_logged === 0
          ? d.date === today
            ? 'Today'
            : 'Not logged'
          : `${formatNumber(d.intake_kcal)} kcal`
  const training = d.sessions_done > 0 ? 'Trained' : !d.training_planned ? 'Rest' : d.date < today ? 'Missed' : 'Planned'
  return (
    <>
      <Box sx={{ fontVariantNumeric: 'tabular-nums', color: d.meals_logged === 0 && food !== 'Fast' ? tokens.ink.secondary : tokens.ink.text }}>{food}</Box>
      <Box sx={{ color: tokens.ink.secondary }}>{training}</Box>
    </>
  )
}

function RevertButton({ plan }: { plan: WeekPlan }) {
  const [open, setOpen] = useState(false)
  const revert = useRevertWeekPlan()
  return (
    <>
      <Button size="small" onClick={() => setOpen(true)} sx={{ minHeight: tokens.tapTarget }}>
        Revert
      </Button>
      <Dialog open={open} onClose={revert.isPending ? undefined : () => setOpen(false)} fullWidth maxWidth="xs" aria-labelledby="revert-week-plan-title">
        <DialogTitle id="revert-week-plan-title">Revert this week’s plan?</DialogTitle>
        <DialogContent>
          <Box sx={{ fontSize: tokens.font.size.emphasis, lineHeight: 1.5 }}>
            The plan it replaced comes back, or the week follows your everyday targets and training days again. Days already
            past keep their targets.
          </Box>
          {revert.isError && (
            <Box role="alert" sx={{ mt: 2, fontSize: tokens.font.size.small, color: tokens.status.flag }}>
              {revert.error.message}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={revert.isPending}>
            Keep it
          </Button>
          <Button
            variant="contained"
            disabled={revert.isPending}
            onClick={() => revert.mutate({ params: { id: plan.id } }, { onSuccess: () => setOpen(false) })}
            data-testid="revert-week-plan"
          >
            {revert.isPending ? 'Reverting…' : 'Revert'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

function DayRows({ view, plan, today }: { view: WeekPlanView; plan: WeekPlan; today: LocalDate }) {
  const last = view.last_week.days
  return (
    <Box component="ul" data-testid="week-view-days" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      <Box
        component="li"
        aria-hidden
        sx={{ display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr) 84px', gap: 2, pb: 1, fontSize: tokens.font.size.caption, color: tokens.ink.secondary }}
      >
        <span />
        <span>Plan</span>
        <span>Last week</span>
      </Box>
      {planDays(plan).map((d, i) => (
        <Box
          component="li"
          key={d.date}
          data-testid="week-view-day"
          sx={{
            display: 'grid',
            gridTemplateColumns: '44px minmax(0, 1fr) 84px',
            gap: 2,
            py: 2,
            alignItems: 'start',
            fontSize: tokens.font.size.label,
            borderTop: `1px solid ${tokens.ink.border}`,
          }}
        >
          <Box>
            <Box sx={{ fontSize: tokens.font.size.small, fontWeight: tokens.font.weight.label }}>{formatWeekday(d.date)}</Box>
            <Box sx={{ color: tokens.ink.secondary, fontVariantNumeric: 'tabular-nums' }}>{Number(d.date.slice(8))}</Box>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ fontSize: tokens.font.size.small, fontVariantNumeric: 'tabular-nums' }}>
              {d.fast ? (
                <Box component="span" sx={{ color: tokens.metric.fasting, fontWeight: tokens.font.weight.label }}>
                  Fast day
                </Box>
              ) : (
                `${formatNumber(d.kcal)} kcal · ${formatNumber(d.protein_g)} g protein`
              )}
              {d.scan && (
                <Box component="span" sx={{ ml: 1, color: tokens.ink.text, fontWeight: tokens.font.weight.label }}>
                  · Scan
                </Box>
              )}
            </Box>
            {d.session ? (
              <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                <SessionThumb session={d.session} size={MINI_MAP} />
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ fontSize: tokens.font.size.small, fontWeight: tokens.font.weight.label, overflowWrap: 'anywhere' }}>{d.session.name}</Box>
                  <Box sx={{ color: tokens.ink.secondary }}>{sessionDetail(d.session)}</Box>
                </Box>
              </Box>
            ) : (
              <Box sx={{ mt: 0.5, color: tokens.ink.secondary }}>Rest</Box>
            )}
          </Box>
          <Box>
            <LastWeek d={last[i]} today={today} />
          </Box>
        </Box>
      ))}
    </Box>
  )
}

export function WeekView({ date }: WeekViewProps) {
  const [monday, setMonday] = useState(() => weekStart(date))
  const view = useWeekPlan(monday)
  const data = view.data
  const plan = data?.active ?? null
  const shown = plan ?? data?.proposed ?? null
  const thisWeek = weekStart(date)
  const range = `${formatShortDate(monday)} – ${formatShortDate(addDays(monday, 6))}`
  const label = monday === thisWeek ? 'This week' : monday === addDays(thisWeek, 7) ? 'Next week' : monday === addDays(thisWeek, -7) ? 'Last week' : range
  const changes = plan ? (data?.changes.active ?? []) : (data?.changes.proposed ?? [])
  const open = addDays(monday, 6) >= date

  return (
    <Card data-testid="week-view" sx={{ p: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <IconButton aria-label="Previous week" onClick={() => setMonday(addDays(monday, -7))} sx={{ width: tokens.tapTarget, height: tokens.tapTarget }}>
          <ChevronLeftRounded />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
          <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.heading }}>{label}</Box>
          {label !== range && <Box sx={{ fontSize: tokens.font.size.label, color: tokens.ink.secondary }}>{range}</Box>}
        </Box>
        <IconButton aria-label="Next week" onClick={() => setMonday(addDays(monday, 7))} sx={{ width: tokens.tapTarget, height: tokens.tapTarget }}>
          <ChevronRightRounded />
        </IconButton>
      </Box>

      {view.isPending ? (
        <Box sx={{ mt: 3, fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>Loading the week…</Box>
      ) : view.isError || !data ? (
        <Box sx={{ mt: 3, fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>The week could not be loaded: {view.error?.message}</Box>
      ) : (
        <>
          <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
            {plan ? <PlanBadge plan={plan} /> : <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>No active plan: your everyday targets apply.</Box>}
            <Box sx={{ flex: 1 }} />
            {plan && open && <RevertButton plan={plan} />}
          </Box>
          {data.proposed && <ProposedBanner plan={data.proposed} />}
          {shown?.plan.focus_note && <Box sx={{ mt: 3, fontSize: tokens.font.size.emphasis, lineHeight: 1.5 }}>{shown.plan.focus_note}</Box>}
          {shown && (
            <Box sx={{ mt: 2, fontSize: tokens.font.size.label, color: tokens.ink.secondary }}>
              Water {formatNumber(shown.plan.water_ml)} ml · steps {formatNumber(shown.plan.steps)}
              {shown.plan.scan_date ? ` · scan ${formatWeekday(shown.plan.scan_date)} ${formatShortDate(shown.plan.scan_date)}` : ''}
            </Box>
          )}

          <Box sx={{ mt: 3 }}>
            <Label>Planned vs eaten</Label>
            <Box sx={{ mt: 1 }}>
              <WeekPlanVsActualChart days={chartDays(data, plan, date)} />
            </Box>
          </Box>

          {shown ? (
            <Box sx={{ mt: 3 }}>
              <DayRows view={data} plan={shown} today={date} />
            </Box>
          ) : (
            <Box sx={{ mt: 3, fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>
              No week plan yet. The coach review (Claude) or Sunday’s weekly review drafts one.
            </Box>
          )}

          {shown && (
            <Box sx={{ mt: 3 }} data-testid="week-view-changes">
              <Label>Changed from last week{plan ? '' : ' (if accepted)'}</Label>
              {changes.length === 0 ? (
                <Box sx={{ mt: 1, fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>Same targets and sessions as last week.</Box>
              ) : (
                <Box component="ul" sx={{ m: 0, mt: 1, pl: 4, fontSize: tokens.font.size.small, lineHeight: 1.6 }}>
                  {changes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </Box>
              )}
            </Box>
          )}
        </>
      )}
    </Card>
  )
}
