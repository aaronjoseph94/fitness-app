// Owns: Today's "This week" card (1d README §5.1: the screen's deep-sky card) — the title with the week's dates and
// whose plan it is ("Oct 5 – 11 · Coach plan"), then one column per day Monday to Sunday on a line with a gold stretch
// up to today: the weekday, a dot (a session done: gold with a check; today: white and glowing, pinging; a session
// planned: ringed; a missed one: ringed dim; a fast: coral with a timer; rest: a small dim dot) and what the day holds
// (the session's name, "Rest", "Fast"), the scan day marked beside its weekday. Under it, as wells: the week's fast
// (its day, hours and that day's water) and "Next Evolt scan" with its date (the scan schedule's due date — the coach's
// or the week plan's scheduled day, else the interval after the last scan — or the plan's scan day before the schedule
// answers; "overdue" once it has passed); then the plan's focus note, any
// proposed plan for this week or later (the week module's banner: Review → Accept), the plan's status, today's carbs,
// fat and fibre targets (the gauges carry the rest), and what the plan changed from last week. Days come from the week
// view's actuals and plan; without a week plan, today's targets and the settings' training days.
import CheckRounded from '@mui/icons-material/CheckRounded'
import PieChartRounded from '@mui/icons-material/PieChartRounded'
import TimerRounded from '@mui/icons-material/TimerRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { keyframes } from '@mui/material/styles'
import { addDays, eachDate, FAST_DAY_EXTRA_WATER_ML, weekdayOf, weekStart } from '@fitness/shared/engine'
import type {
  DayView,
  LocalDate,
  Weekday,
  WeekPlan,
  WeekPlanAuthor,
  WeekPlanView,
} from '@fitness/shared/schemas'
import { useState, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router'
import {
  deepSkyRule,
  deepSkyWell,
  DeepSkyCard,
  displayTitle,
  formatDayRange,
  formatNumber,
  formatShortDate,
  formatWeekday,
  useEntrance,
} from '../../../components'
import { COARSE_POINTER_QUERY, enterEasing, tokens } from '../../../theme'
import { PlanBadge, ProposedBanner } from '../../week'

const { summit, font } = tokens
const sky = summit.deepSky

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
  /** When the next Evolt scan is due (GET /api/scans/schedule), null before it answers or with no scan yet. */
  scanDue: LocalDate | null
}

/** Lines of "what changed" shown before "and N more"; proposed plans shown. */
const CHANGES_SHOWN = 4
const PROPOSED_SHOWN = 2
/** The day dot's size, and a rest day's. */
const DOT = 28
const REST_DOT = 14

type Mark = 'done' | 'fast' | 'planned' | 'missed' | 'rest'

const PLAN_NAME: Record<WeekPlanAuthor, string> = {
  claude_mcp: 'Coach plan',
  gemini: 'AI plan',
  user: 'Your plan',
}

const MARK_TEXT: Record<Mark, string> = {
  done: 'session done',
  fast: 'fast',
  planned: 'session planned',
  missed: 'session missed',
  rest: 'rest',
}

const ping = keyframes`
  0% { opacity: 0.9; transform: scale(1); }
  80%, 100% { opacity: 0; transform: scale(1.9); }
`

/** What one day of the week shows. Today's own day view knows best (a fast day drops training). */
function markOf(
  d: LocalDate,
  date: LocalDate,
  day: DayView | undefined,
  week: WeekPlanView | null,
  trainingDays: readonly Weekday[] | null,
): Mark {
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
      : (actual?.training_planned ??
        (plan ? plan.plan.sessions[wd] !== null : (trainingDays?.includes(wd) ?? false)))
  if (!training) return 'rest'
  return d < date ? 'missed' : 'planned'
}

/** The words under a day's dot: the planned session's name, else what the day is. */
function dayCaption(mark: Mark, session: string | null): string {
  if (mark === 'fast') return 'Fast'
  if (mark === 'rest') return 'Rest'
  return session ?? 'Training'
}

/** One day's dot. */
function Dot({ mark, isToday }: { mark: Mark; isToday: boolean }) {
  const round = { width: DOT, height: DOT, borderRadius: '50%', boxSizing: 'border-box', mx: 'auto' } as const
  if (isToday && mark !== 'done' && mark !== 'fast')
    return (
      <Box sx={{ position: 'relative', ...round }}>
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: `2px solid ${summit.gold.main}`,
            boxSizing: 'border-box',
            animation: `${ping} 2400ms ease-out infinite`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            bgcolor: sky.text,
            boxShadow: `0 0 18px ${summit.gold.main}`,
          }}
        />
      </Box>
    )
  switch (mark) {
    case 'done':
      return (
        <Box
          sx={{
            ...round,
            bgcolor: summit.gold.main,
            color: summit.ink.deep,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <CheckRounded sx={{ fontSize: 18 }} />
        </Box>
      )
    case 'fast':
      return (
        <Box
          sx={{
            ...round,
            bgcolor: summit.coral.main,
            color: sky.text,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <TimerRounded sx={{ fontSize: 17 }} />
        </Box>
      )
    case 'planned':
    case 'missed':
      return (
        <Box
          sx={{
            ...round,
            bgcolor: summit.ink.deep,
            border: `2px solid ${mark === 'planned' ? sky.muted : sky.hairline}`,
          }}
        />
      )
    case 'rest':
      return (
        <Box
          sx={{
            width: REST_DOT,
            height: REST_DOT,
            borderRadius: '50%',
            mx: 'auto',
            my: `${(DOT - REST_DOT) / 2}px`,
            bgcolor: summit.glass.border,
          }}
        />
      )
  }
}

/** The line behind the dots and its gold stretch up to today (grows from 0 on mount). */
function WeekLine({ todayIndex }: { todayIndex: number }) {
  const { entered, reduced } = useEntrance()
  const inset = 'calc(100% / 14)'
  const line = { position: 'absolute', left: inset, height: 2, top: `calc(18px + ${DOT / 2 - 1}px)` } as const
  return (
    <>
      <Box aria-hidden sx={{ ...line, right: inset, bgcolor: summit.glass.border }} />
      {todayIndex > 0 && (
        <Box
          aria-hidden
          sx={{
            ...line,
            width: `calc((100% - 100% / 7) * ${todayIndex / 6})`,
            bgcolor: summit.gold.main,
            transformOrigin: 'left',
            transform: entered ? 'none' : 'scaleX(0)',
            transition: reduced ? 'none' : `transform 1000ms ${enterEasing()} 600ms`,
          }}
        />
      )}
    </>
  )
}

/** "Changed from last week": the first CHANGES_SHOWN lines, then "and N more". */
function Changes({ changes }: { changes: readonly string[] }) {
  const [all, setAll] = useState(false)
  return (
    <Box data-testid="week-changes">
      <Box sx={{ fontWeight: font.weight.heading, color: sky.text }}>Changed from last week</Box>
      {changes.length === 0 ? (
        <Box>Same targets and sessions as last week.</Box>
      ) : (
        <>
          <Box component="ul" sx={{ m: 0, mt: '2px', pl: '18px' }}>
            {(all ? changes : changes.slice(0, CHANGES_SHOWN)).map((c) => (
              <li key={c}>{c}</li>
            ))}
          </Box>
          {!all && changes.length > CHANGES_SHOWN && (
            <Button
              variant="text"
              size="tiny"
              onClick={() => setAll(true)}
              sx={{
                mt: '2px',
                ml: '-8px',
                color: sky.text,
                '&:hover': { bgcolor: sky.well, color: sky.text },
              }}
            >
              and {changes.length - CHANGES_SHOWN} more
            </Button>
          )}
        </>
      )}
    </Box>
  )
}

/** A well row on the deep sky: a glyph, the fact, and its figure on the right. */
function WellRow({ icon, children, value }: { icon: ReactNode; children: ReactNode; value?: ReactNode }) {
  return (
    <Box
      sx={{
        ...deepSkyWell,
        borderRadius: `${summit.radius.wellSmall}px`,
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '4px 10px',
        minHeight: tokens.tapTarget,
        boxSizing: 'border-box',
        px: '14px',
        py: '11px',
        fontSize: font.size.body,
        fontWeight: font.weight.body,
        minWidth: 0,
      }}
    >
      {icon}
      <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>{children}</Box>
      {value && (
        <Box sx={{ flex: 'none', color: sky.muted, fontVariantNumeric: 'tabular-nums' }}>{value}</Box>
      )}
    </Box>
  )
}

export function ThisWeekCard({
  date,
  day,
  week,
  proposed,
  trainingDays,
  fastHours,
  waterTargetMl,
  scanDue,
}: ThisWeekCardProps) {
  const monday = weekStart(date)
  const sunday = addDays(monday, 6)
  const plan = week?.active ?? null
  // One next scan: the schedule's due date, else the week plan's scan day.
  const nextScan = scanDue ?? plan?.plan.scan_date ?? null
  const days = eachDate(monday, sunday).map((d) => {
    const mark = markOf(d, date, day, week, trainingDays)
    const session =
      plan?.plan.sessions[weekdayOf(d)]?.name ?? (d === date ? (day?.planned_session?.name ?? null) : null)
    return { date: d, mark, caption: dayCaption(mark, session), scan: nextScan === d }
  })
  const todayIndex = days.findIndex((d) => d.date === date)
  const range = formatDayRange(monday, sunday)
  const fastWater = (plan?.plan.water_ml ?? waterTargetMl) + FAST_DAY_EXTRA_WATER_ML
  const fasts = days.filter((d) => d.mark === 'fast')
  // Today's materialised targets know best; else the plan's for this weekday. Calories, protein, water and steps are on
  // the gauges, so the card adds the other three.
  const t = day?.targets ?? plan?.plan.targets[weekdayOf(date)] ?? null
  const fastToday = days.find((d) => d.date === date)?.mark === 'fast'
  const small = { fontSize: font.size.small, lineHeight: font.leading.small, color: sky.muted } as const

  return (
    <DeepSkyCard testId="this-week" ariaLabel="This week">
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '4px 12px',
        }}
      >
        <Box component="h2" sx={{ ...displayTitle('section'), m: 0, minWidth: 0 }}>
          This week
        </Box>
        <Box
          component="span"
          sx={{ fontSize: font.size.small, fontWeight: font.weight.body, color: sky.muted }}
        >
          {range}
          {plan ? ` · ${PLAN_NAME[plan.author]}` : ''}
        </Box>
      </Box>

      <Box sx={{ position: 'relative', mt: '24px' }}>
        <WeekLine todayIndex={todayIndex} />
        <Box
          component="ol"
          aria-label="This week’s days"
          sx={{
            position: 'relative',
            listStyle: 'none',
            m: 0,
            p: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            textAlign: 'center',
          }}
        >
          {days.map(({ date: d, mark, caption, scan: isScan }) => {
            const isToday = d === date
            return (
              <Box
                component="li"
                key={d}
                aria-current={isToday ? 'date' : undefined}
                aria-label={`${formatWeekday(d)} ${formatShortDate(d)}${isToday ? ', today' : ''}: ${MARK_TEXT[mark]}${isScan ? ', Evolt scan' : ''}`}
                sx={{ minWidth: 0 }}
              >
                <Box
                  aria-hidden
                  sx={{
                    height: 18,
                    fontSize: font.size.caption,
                    fontWeight: font.weight.heading,
                    color: isToday ? summit.gold.main : mark === 'fast' ? summit.coral.main : sky.muted,
                  }}
                >
                  {formatWeekday(d)}
                  {isScan && (
                    <Box
                      component="span"
                      sx={{
                        display: 'inline-block',
                        ml: '3px',
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        border: `1.5px solid ${tokens.tone.success.light}`,
                      }}
                    />
                  )}
                </Box>
                <Box aria-hidden sx={{ mt: '8px' }}>
                  <Dot mark={mark} isToday={isToday} />
                </Box>
                <Box
                  aria-hidden
                  sx={{
                    mt: '8px',
                    px: '1px',
                    fontSize: font.size.micro,
                    lineHeight: 1.25,
                    fontWeight: isToday || mark === 'fast' ? font.weight.heading : font.weight.body,
                    color: isToday ? sky.text : mark === 'fast' ? summit.coral.main : sky.muted,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {caption}
                </Box>
              </Box>
            )
          })}
        </Box>
      </Box>

      {(fasts.length > 0 || nextScan) && (
        <Box sx={{ mt: '18px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '8px' }}>
          {fasts.map((f) => (
            <WellRow
              key={f.date}
              icon={
                <TimerRounded aria-hidden sx={{ fontSize: 20, color: summit.coral.main, flex: 'none' }} />
              }
              value={`water ${formatNumber(fastWater / 1000, 1)} L`}
            >
              {formatWeekday(f.date)} · {fastHours ? `${fastHours} h fast` : 'Fast'}
            </WellRow>
          ))}
          {nextScan && (
            <WellRow
              icon={
                <PieChartRounded
                  aria-hidden
                  sx={{ fontSize: 20, color: tokens.tone.success.light, flex: 'none' }}
                />
              }
              value={
                <Box component="span" data-testid="today-next-scan">
                  {nextScan < date ? `overdue · ${formatShortDate(nextScan)}` : formatShortDate(nextScan)}
                </Box>
              }
            >
              <Box
                component={RouterLink}
                to="/scans"
                sx={{
                  color: sky.text,
                  '&:hover': { color: sky.text, textDecoration: 'underline' },
                  [COARSE_POINTER_QUERY]: {
                    display: 'inline-flex',
                    alignItems: 'center',
                    minHeight: tokens.tapTarget,
                  },
                }}
              >
                Next Evolt scan
              </Box>
            </WellRow>
          )}
        </Box>
      )}

      {plan?.plan.focus_note && (
        <Box data-testid="week-focus" sx={{ ...small, mt: '14px' }}>
          {plan.plan.focus_note}
        </Box>
      )}

      {proposed.slice(0, PROPOSED_SHOWN).map((p) => (
        <Box key={p.id} sx={{ mt: '12px' }}>
          <ProposedBanner plan={p} />
        </Box>
      ))}

      <Box sx={{ ...small, mt: '14px', pt: '12px', borderTop: deepSkyRule, display: 'grid', gap: '10px' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 10px' }}>
          <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
            <Box component="span" sx={{ fontWeight: font.weight.heading, color: sky.text }}>
              Today’s targets{fastToday ? ' · fast day' : ''}
            </Box>
            {' · '}
            {t
              ? `${formatNumber(t.carbs_g)} g carbs · ${formatNumber(t.fat_g)} g fat · ${formatNumber(t.fibre_g)} g fibre`
              : 'none yet; they come from the active plan'}
          </Box>
          {plan && <PlanBadge plan={plan} />}
        </Box>
        {plan && <Changes changes={week?.changes.active ?? []} />}
      </Box>
    </DeepSkyCard>
  )
}
