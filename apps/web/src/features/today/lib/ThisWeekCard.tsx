// Owns: Today's "This week" card (2a) — the week's dates and whose plan it is ("Oct 5 – 11 · Coach plan"), one 34 px
// cell per day Monday to Sunday (a session done: green check; today: blue; a session planned: dashed; a fast: amber
// timer; rest: plain; the scan day ringed beside its weekday), and the legend, with the fast day's hours and water
// target and the plan's status. Under it the
// plan's focus note, any proposed plan for this week or later (the week module's banner: Review → Accept), today's
// carbs, fat and fibre targets (the stat cards carry the rest), and what the plan changed from last week. Days come
// from the week view's actuals and plan; without a week plan, today's targets and the settings' training days.
import CheckRounded from '@mui/icons-material/CheckRounded'
import FitnessCenterRounded from '@mui/icons-material/FitnessCenterRounded'
import TimerRounded from '@mui/icons-material/TimerRounded'
import type { SvgIconComponent } from '@mui/icons-material'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { addDays, eachDate, FAST_DAY_EXTRA_WATER_ML, weekdayOf, weekStart } from '@fitness/shared/engine'
import type { DayView, LocalDate, Weekday, WeekPlan, WeekPlanAuthor, WeekPlanView } from '@fitness/shared/schemas'
import { useState } from 'react'
import { formatDayRange, formatNumber, formatShortDate, formatWeekday, LegendChips, Panel, type LegendItem } from '../../../components'
import { tokens } from '../../../theme'
import { PlanBadge, ProposedBanner } from '../../week'

interface ThisWeekCardProps {
  date: LocalDate
  day: DayView | undefined
  week: WeekPlanView | null
  /** Plans proposed for this week or later, soonest first (GET /api/week-plans?status=proposed). */
  proposed: readonly WeekPlan[]
  trainingDays: readonly Weekday[] | null
  /** Settings: a fast's length and the everyday water target (a fast day adds to it). */
  fastHours: number | null
  waterTargetMl: number
}

/** Lines of "what changed" shown before "and N more"; proposed plans shown. */
const CHANGES_SHOWN = 4
const PROPOSED_SHOWN = 2

type Mark = 'done' | 'fast' | 'planned' | 'missed' | 'rest'

const PLAN_NAME: Record<WeekPlanAuthor, string> = { claude_mcp: 'Coach plan', gemini: 'AI plan', user: 'Your plan' }

const MARK_TEXT: Record<Mark, string> = { done: 'session done', fast: 'fast', planned: 'session planned', missed: 'session missed', rest: 'rest' }

const GLYPH: Partial<Record<Mark, SvgIconComponent>> = { done: CheckRounded, fast: TimerRounded, planned: FitnessCenterRounded, missed: FitnessCenterRounded }

/** What one day of the week shows. Today's own day view knows best (a fast day drops training). */
function markOf(d: LocalDate, date: LocalDate, day: DayView | undefined, week: WeekPlanView | null, trainingDays: readonly Weekday[] | null): Mark {
  const actual = week?.days.find((a) => a.date === d)
  const plan = week?.active ?? null
  const wd = weekdayOf(d)
  const isToday = d === date
  if ((actual?.sessions_done ?? 0) > 0 || (isToday && day?.session?.ended_at)) return 'done'
  const fast =
    (isToday && (day?.fast.is_fast_day === true || day?.targets?.is_fast_day === true)) ||
    actual?.is_fast_day === true ||
    (plan?.plan.fast_dates.includes(d) ?? false)
  if (fast) return 'fast'
  const training =
    isToday && day?.targets
      ? day.targets.training_planned
      : (actual?.training_planned ?? (plan ? plan.plan.sessions[wd] !== null : (trainingDays?.includes(wd) ?? false)))
  if (!training) return 'rest'
  return d < date ? 'missed' : 'planned'
}

function cellSx(mark: Mark, isToday: boolean) {
  if (isToday) return { bgcolor: tokens.accent.main, color: tokens.ink.card }
  switch (mark) {
    case 'done':
      return { bgcolor: tokens.tone.success.bg, color: tokens.tone.success.text }
    case 'fast':
      return { bgcolor: tokens.tone.warning.bg, color: tokens.tone.warning.text }
    case 'planned':
    case 'missed':
      return { border: `1px dashed ${tokens.ink.dashed}`, color: tokens.ink.muted }
    case 'rest':
      return { bgcolor: tokens.ink.panel }
  }
}

/** The hairline section's small lines: 12 px muted. */
const SMALL = { fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.caption, color: tokens.ink.muted } as const

/** "Changed from last week": the first CHANGES_SHOWN lines, then "and N more". */
function Changes({ changes }: { changes: readonly string[] }) {
  const [all, setAll] = useState(false)
  return (
    <Box data-testid="week-changes">
      <Box sx={{ ...SMALL, fontWeight: tokens.font.weight.label, color: tokens.ink.label }}>Changed from last week</Box>
      {changes.length === 0 ? (
        <Box sx={SMALL}>Same targets and sessions as last week.</Box>
      ) : (
        <>
          <Box component="ul" sx={{ ...SMALL, m: 0, mt: '2px', pl: '18px' }}>
            {(all ? changes : changes.slice(0, CHANGES_SHOWN)).map((c) => (
              <li key={c}>{c}</li>
            ))}
          </Box>
          {!all && changes.length > CHANGES_SHOWN && (
            <Button variant="text" size="tiny" onClick={() => setAll(true)} sx={{ mt: '2px', ml: '-8px' }}>
              and {changes.length - CHANGES_SHOWN} more
            </Button>
          )}
        </>
      )}
    </Box>
  )
}

export function ThisWeekCard({ date, day, week, proposed, trainingDays, fastHours, waterTargetMl }: ThisWeekCardProps) {
  const monday = weekStart(date)
  const sunday = addDays(monday, 6)
  const plan = week?.active ?? null
  const days = eachDate(monday, sunday).map((d) => ({ date: d, mark: markOf(d, date, day, week, trainingDays), scan: plan?.plan.scan_date === d }))
  const range = formatDayRange(monday, sunday)
  const fastWater = (plan?.plan.water_ml ?? waterTargetMl) + FAST_DAY_EXTRA_WATER_ML
  const legend: LegendItem[] = [
    { label: 'Done', color: tokens.tone.success.text },
    { label: 'Today', color: tokens.accent.main },
  ]
  if (days.some((d) => d.mark === 'fast'))
    legend.push({ label: `${fastHours ? `${fastHours} h fast` : 'Fast'} · water ${formatNumber(fastWater / 1000, 1)} L`, color: tokens.tone.warning.text })
  if (days.some((d) => d.scan)) legend.push({ label: 'Scan', color: tokens.metric.lean, mark: 'ring' })
  // Today's materialised targets know best; else the plan's for this weekday. Calories, protein, water and steps are on
  // the stat cards, so the card adds the other three.
  const t = day?.targets ?? plan?.plan.targets[weekdayOf(date)] ?? null
  const fastToday = days.find((d) => d.date === date)?.mark === 'fast'

  return (
    <Panel
      title="This week"
      testId="this-week"
      actions={
        <Box component="span" sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.muted, whiteSpace: 'nowrap' }}>
          {range} · {plan ? PLAN_NAME[plan.author] : 'Daily targets'}
        </Box>
      }
    >
      <Box
        component="ol"
        aria-label="This week’s days"
        sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '6px' }}
      >
        {days.map(({ date: d, mark, scan }) => {
          const isToday = d === date
          const Glyph = GLYPH[mark]
          return (
            <Box
              component="li"
              key={d}
              aria-current={isToday ? 'date' : undefined}
              aria-label={`${formatWeekday(d)} ${formatShortDate(d)}${isToday ? ', today' : ''}: ${MARK_TEXT[mark]}${scan ? ', Evolt scan' : ''}`}
              sx={{ minWidth: 0, textAlign: 'center' }}
            >
              <Box
                aria-hidden
                sx={{ height: 34, borderRadius: `${tokens.radius.segment}px`, display: 'grid', placeItems: 'center', ...cellSx(mark, isToday) }}
              >
                {Glyph && <Glyph sx={{ fontSize: 16 }} />}
              </Box>
              <Box
                aria-hidden
                sx={{
                  mt: '6px',
                  fontSize: tokens.font.size.micro,
                  fontWeight: isToday ? tokens.font.weight.heading : tokens.font.weight.label,
                  color: isToday ? tokens.ink.text : tokens.ink.muted,
                }}
              >
                {formatWeekday(d)}
                {scan && (
                  <Box
                    component="span"
                    sx={{ display: 'inline-block', ml: '3px', width: 6, height: 6, borderRadius: `${tokens.radius.pill}px`, border: `1.5px solid ${tokens.metric.lean}` }}
                  />
                )}
              </Box>
            </Box>
          )
        })}
      </Box>
      {/* The plan's status sits at the end of the legend row: beside the dates it would push them under the title. */}
      <Box sx={{ mt: '12px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <LegendChips items={legend} />
        {plan && (
          <Box sx={{ ml: 'auto' }}>
            <PlanBadge plan={plan} />
          </Box>
        )}
      </Box>

      {plan?.plan.focus_note && (
        <Box data-testid="week-focus" sx={{ mt: '12px', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.muted }}>
          {plan.plan.focus_note}
        </Box>
      )}

      {proposed.slice(0, PROPOSED_SHOWN).map((p) => (
        <Box key={p.id} sx={{ mt: '12px' }}>
          <ProposedBanner plan={p} />
        </Box>
      ))}

      <Box sx={{ mt: '14px', pt: '12px', borderTop: `1px solid ${tokens.ink.hairline}`, display: 'grid', gap: '10px' }}>
        <Box sx={SMALL}>
          <Box component="span" sx={{ fontWeight: tokens.font.weight.label, color: tokens.ink.label }}>
            Today’s targets{fastToday ? ' · fast day' : ''}
          </Box>
          {' · '}
          {t
            ? `${formatNumber(t.carbs_g)} g carbs · ${formatNumber(t.fat_g)} g fat · ${formatNumber(t.fibre_g)} g fibre`
            : 'none yet; they come from the active plan'}
        </Box>
        {plan && <Changes changes={week?.changes.active ?? []} />}
      </Box>
    </Panel>
  )
}
