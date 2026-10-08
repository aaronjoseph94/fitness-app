// Owns: the full week view on Progress (SPEC §8, §11 "Week plan vs actuals"; 2a's "Week plan" table card) — pick a
// week (‹ ›), its plan's status and author, a proposed plan's Review → Accept, the plan's focus note, then one table
// row per day: the session (✓ once done; a fast day in the warning colour), the day's kcal · protein targets, and last
// week's kcal · protein for the same weekday, today's row tinted. Under the table: the planned-vs-eaten chart with
// each day's session mark, what changed from last week, the week's water and steps targets (and scan date), and
// Revert for the active plan of a week not yet over.
import CheckRounded from '@mui/icons-material/CheckRounded'
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import { addDays, weekStart } from '@fitness/shared/engine'
import { Weekday, type LocalDate, type WeekDayActual, type WeekPlan, type WeekPlanView } from '@fitness/shared/schemas'
import { useState } from 'react'
import { WeekPlanVsActualChart, type PlanDay, type SessionStatus } from '../../../charts'
import { formatNumber, formatShortDate, formatWeekday, isQueryLoading, Panel, QueryStateCard, visuallyHidden } from '../../../components'
import { tokens } from '../../../theme'
import { AUTHOR, Label, PlanBadge, planDays } from './parts'
import { ProposedBanner } from './ProposedBanner'
import { useRevertWeekPlan, useWeekPlan } from './useWeekPlan'

export interface WeekViewProps {
  /** Today (America/Edmonton); the view opens on its week. */
  date: LocalDate
}

/** "Oct 5 – 11", or "Sep 28 – Oct 4" across a month. */
function weekRange(monday: LocalDate): string {
  const sunday = addDays(monday, 6)
  return monday.slice(0, 7) === sunday.slice(0, 7)
    ? `${formatShortDate(monday)} – ${Number(sunday.slice(8))}`
    : `${formatShortDate(monday)} – ${formatShortDate(sunday)}`
}

/** "1,400 · 130 g". */
const kcalProtein = (kcal: number, protein: number) => `${formatNumber(kcal)} · ${formatNumber(protein)} g`

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

/** Last week's same weekday: kcal · protein eaten, or a fast, or why there is nothing (not logged, today, ahead). */
function lastWeek(d: WeekDayActual | undefined, today: LocalDate): string {
  if (!d || (d.target_kcal === null && d.meals_logged === 0)) return '—'
  // The fast day itself, or a day a fast overlapped with nothing eaten. A fast begun at 19:00 overlaps that day too, but
  // the lunch and dinner eaten before it are what the day shows.
  if (d.is_fast_day || (d.fasted && d.meals_logged === 0)) return 'Fast'
  if (d.date > today) return 'Ahead'
  if (d.meals_logged === 0) return d.date === today ? 'Today' : 'Not logged'
  return kcalProtein(d.intake_kcal, d.intake_protein_g)
}

function RevertButton({ plan }: { plan: WeekPlan }) {
  const [open, setOpen] = useState(false)
  const revert = useRevertWeekPlan()
  return (
    <>
      <Button size="small" onClick={() => setOpen(true)}>
        Revert
      </Button>
      <Dialog open={open} onClose={revert.isPending ? undefined : () => setOpen(false)} fullWidth maxWidth="xs" aria-labelledby="revert-week-plan-title">
        <DialogTitle id="revert-week-plan-title">Revert this week’s plan?</DialogTitle>
        <DialogContent>
          <Box sx={{ fontSize: tokens.font.size.body, lineHeight: tokens.font.leading.body, color: tokens.ink.body }}>
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
          <Button variant="outlined" onClick={() => setOpen(false)} disabled={revert.isPending}>
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

/** 2a's rows: 8 px above and below a cell, 6 px in the head. Phones: tighter cell padding so four columns fit 358 px;
 * the session name wraps. */
const cellSx = {
  py: '8px',
  px: { xs: '8px', sm: '12px' },
  '&:first-of-type': { pl: { xs: '16px', sm: `${tokens.pad.card.x}px` } },
  '&:last-of-type': { pr: { xs: '16px', sm: `${tokens.pad.card.x}px` } },
  '&.MuiTableCell-head': { py: '6px' },
}

function DayTable({ view, plan, today }: { view: WeekPlanView; plan: WeekPlan; today: LocalDate }) {
  const last = view.last_week.days
  return (
    <Table data-testid="week-view-days" aria-label={`Week plan, ${weekRange(plan.week_start)}`} sx={{ '& .MuiTableCell-root': cellSx }}>
      <TableHead>
        <TableRow>
          <TableCell>Day</TableCell>
          <TableCell>Session</TableCell>
          <TableCell align="right">kcal · protein</TableCell>
          <TableCell align="right">Last week</TableCell>
        </TableRow>
      </TableHead>
      <TableBody sx={{ '& tr:last-of-type td': { borderBottom: 0 } }}>
        {planDays(plan).map((d, i) => {
          const isToday = d.date === today
          const done = (view.days[i]?.sessions_done ?? 0) > 0
          const strong = isToday ? tokens.font.weight.heading : undefined
          // #71717A on today's #EFF6FF tint is 4.44:1, under AA for 13 px text; the row's muted text steps up to #52525B.
          const muted = isToday ? tokens.ink.label : tokens.ink.secondary
          return (
            <TableRow
              key={d.date}
              data-testid="week-view-day"
              aria-current={isToday ? 'date' : undefined}
              sx={{ bgcolor: isToday ? tokens.accent.soft : undefined }}
            >
              <TableCell
                sx={{
                  whiteSpace: 'nowrap',
                  fontWeight: strong,
                  color: d.fast ? tokens.tone.warning.text : isToday ? tokens.ink.text : tokens.ink.secondary,
                }}
              >
                {formatWeekday(d.date)} {Number(d.date.slice(8))}
              </TableCell>
              <TableCell sx={{ fontWeight: strong, color: d.session || d.fast ? tokens.ink.text : muted, overflowWrap: 'anywhere' }}>
                {d.fast ? 'Fast day' : (d.session?.name ?? 'Rest')}
                {done && (
                  <>
                    <CheckRounded aria-hidden sx={{ ml: '4px', fontSize: 15, verticalAlign: '-3px', color: tokens.tone.success.text }} />
                    <Box component="span" sx={visuallyHidden}>
                      , done
                    </Box>
                  </>
                )}
                {d.scan && (
                  <Box component="span" sx={{ color: muted, fontWeight: tokens.font.weight.body }}>
                    {' '}
                    · scan
                  </Box>
                )}
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: tokens.ink.text }}>
                {d.fast ? '— · —' : kcalProtein(d.kcal, d.protein_g)}
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: muted }}>
                {lastWeek(last[i], today)}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

const note = { fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.secondary } as const
const gutter = { px: { xs: '16px', sm: `${tokens.pad.card.x}px` } } as const

export function WeekView({ date }: WeekViewProps) {
  const [monday, setMonday] = useState(() => weekStart(date))
  const view = useWeekPlan(monday)
  const data = view.data
  const plan = data?.active ?? null
  const shown = plan ?? data?.proposed ?? null
  const thisWeek = weekStart(date)
  const range = weekRange(monday)
  const label = monday === thisWeek ? null : monday === addDays(thisWeek, 7) ? 'Next week' : monday === addDays(thisWeek, -7) ? 'Last week' : null
  const changes = plan ? (data?.changes.active ?? []) : (data?.changes.proposed ?? [])
  const open = addDays(monday, 6) >= date
  const source = !data ? null : plan ? `Plan by ${AUTHOR[plan.author]}` : 'Your everyday targets'
  const description = [label, range, source, 'beside last week’s actuals'].filter(Boolean).join(' · ')

  return (
    <Panel
      title="Week plan"
      description={description}
      padding="none"
      testId="week-view"
      actions={
        <>
          {plan && <PlanBadge plan={plan} />}
          <Box sx={{ display: 'flex' }}>
            <IconButton size="small" aria-label="Previous week" onClick={() => setMonday(addDays(monday, -7))}>
              <ChevronLeftRounded fontSize="small" />
            </IconButton>
            <IconButton size="small" aria-label="Next week" onClick={() => setMonday(addDays(monday, 7))}>
              <ChevronRightRounded fontSize="small" />
            </IconButton>
          </Box>
        </>
      }
    >
      {isQueryLoading(view) ? (
        <Box sx={{ ...gutter, pt: '4px', pb: '16px', ...note }}>Loading the week…</Box>
      ) : view.isError || !data ? (
        <Box sx={{ ...gutter, pt: '4px', pb: '16px' }}>
          <QueryStateCard query={view} what="the week" />
        </Box>
      ) : (
        <>
          {data.proposed && (
            <Box sx={{ ...gutter, pb: '12px' }}>
              <ProposedBanner plan={data.proposed} />
            </Box>
          )}
          {shown?.plan.focus_note && (
            <Box sx={{ ...gutter, pb: '12px', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.body }}>
              {shown.plan.focus_note}
            </Box>
          )}
          {shown ? (
            <DayTable view={data} plan={shown} today={date} />
          ) : (
            <Box sx={{ ...gutter, pt: '4px', pb: '16px', ...note }}>No week plan yet. The coach review (Claude) or Sunday’s weekly review drafts one.</Box>
          )}

          <Box sx={{ ...gutter, pt: '12px', pb: shown ? '4px' : '16px', borderTop: `1px solid ${tokens.ink.hairline}` }}>
            <Label>Planned vs eaten</Label>
            <Box sx={{ mt: '8px' }}>
              <WeekPlanVsActualChart days={chartDays(data, plan, date)} height={200} />
            </Box>
          </Box>

          {shown && (
            <Box sx={{ ...gutter, py: '12px', borderTop: `1px solid ${tokens.ink.hairline}`, display: 'grid', gap: '10px' }}>
              <Box data-testid="week-view-changes">
                <Label>Changed from last week{plan ? '' : ' (if accepted)'}</Label>
                {changes.length === 0 ? (
                  <Box sx={{ mt: '2px', ...note }}>Same targets and sessions as last week.</Box>
                ) : (
                  <Box component="ul" sx={{ m: 0, mt: '4px', pl: 4, ...note, color: tokens.ink.body }}>
                    {changes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </Box>
                )}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                <Box sx={{ flex: 1, minWidth: 0, ...note, fontVariantNumeric: 'tabular-nums' }}>
                  Water {formatNumber(shown.plan.water_ml)} ml · steps {formatNumber(shown.plan.steps)}
                  {shown.plan.scan_date ? ` · scan ${formatWeekday(shown.plan.scan_date)} ${formatShortDate(shown.plan.scan_date)}` : ''}
                </Box>
                {plan && open && <RevertButton plan={plan} />}
              </Box>
            </Box>
          )}
        </>
      )}
    </Panel>
  )
}
