// Owns: the Dashboard's goal facts and the two panels that show them without a chart. `goalFacts` derives, from the
// window the sections below draw, where Aaron stands against the goal (start, now, goal, the share behind him, the rate
// the goal date needs, the forecast finish, the next milestone). `GoalRail` is 1d's deep-sky "Against the plan" card
// beside the trend card: a 76 px gold ring for the share of the climb done, "Ahead, week 2", the outlook, then one row
// per plan fact (weekly rate, sessions, fasts, days logged, next camp, next Evolt scan) and the way to the plan
// history. `LatestDay` is the latest day's targets as a slim white strip. Everything comes from the same window, so
// neither can disagree with it. (The expenditure estimate moved to the page's subtitle, as 1d draws it.)
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded'
import BedtimeRounded from '@mui/icons-material/BedtimeRounded'
import DirectionsWalkRounded from '@mui/icons-material/DirectionsWalkRounded'
import EggAltRounded from '@mui/icons-material/EggAltRounded'
import LocalFireDepartmentRounded from '@mui/icons-material/LocalFireDepartmentRounded'
import WaterDropRounded from '@mui/icons-material/WaterDropRounded'
import FlagRounded from '@mui/icons-material/FlagRounded'
import PieChartRounded from '@mui/icons-material/PieChartRounded'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import type { SvgIconComponent } from '@mui/icons-material'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router'
import { addDays, daysBetween, fastDay, weekdayOf, weekStart } from '@fitness/shared/engine'
import type { DaySummary, LocalDate, TargetValues } from '@fitness/shared/schemas'
import {
  cardSurface,
  DeepSkyCard,
  deepSkyRule,
  displayTitle,
  eyebrow,
  formatNumber,
  formatShortDate,
  formatWeekday,
  MetricRing,
  tabularNums,
  useEntrance,
} from '../../../components'
import { copy } from '../../../copy'
import { COARSE_POINTER_QUERY, enterEasing, tokens, type MetricKey } from '../../../theme'
import { confirmedScans } from '../../scans/charts'
import {
  forecastRate,
  lastTrend,
  milestoneTimelines,
  paceVersusPlan,
  plannedFasts,
  projectionOf,
  SLEEP_TARGET_H,
} from '../../progress/series'
import type { DashboardData } from './useDashboardData'

/** SPEC §2: a planned fast lasts 24 h. */
const DEFAULT_FAST_HOURS = 24
/** SPEC §12 decided default: a scan every 4 weeks. Used only when settings have not loaded. */
const DEFAULT_SCAN_INTERVAL_DAYS = 28
/** A share of days logged at or above this reads green; below it, amber. */
const LOGGED_GOOD_SHARE = 0.8

/** The most recent day that carries a target: fast days have none by design, so they are skipped. */
function latestTargetDay(days: readonly DaySummary[]): DaySummary | null {
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i]
    if (day?.targets && !day.is_fast_day) return day
  }
  return null
}

interface GoalRow {
  key: string
  label: string
  icon: SvgIconComponent
  metric: MetricKey
  value: number
  target: number
  unit: string
  /** False when nothing was logged (steps not synced yet): the row says "Not logged", not "0 / 8,000 · 0 %". */
  logged: boolean
}

/** The latest day's targets as rows: value, target and the share of it reached. Pure. */
export function goalRows(day: DaySummary | null, waterTargetMl: number): GoalRow[] {
  const targets: TargetValues | null = day?.targets ?? null
  if (!day || !targets) return []
  const rows: GoalRow[] = [
    {
      key: 'kcal',
      label: 'Calories',
      icon: LocalFireDepartmentRounded,
      metric: 'calories',
      value: Math.round(day.intake.kcal),
      target: targets.kcal,
      unit: 'kcal',
      logged: true,
    },
    {
      key: 'protein',
      label: 'Protein',
      icon: EggAltRounded,
      metric: 'protein',
      value: Math.round(day.intake.protein_g),
      target: targets.protein_g,
      unit: 'g',
      logged: true,
    },
    {
      key: 'water',
      label: 'Water',
      icon: WaterDropRounded,
      metric: 'water',
      value: day.water_ml,
      target: targets.water_ml || waterTargetMl,
      unit: 'ml',
      logged: true,
    },
    {
      key: 'steps',
      label: 'Steps',
      icon: DirectionsWalkRounded,
      metric: 'steps',
      value: day.steps ?? 0,
      target: targets.steps,
      unit: 'steps',
      logged: day.steps !== null,
    },
  ]
  const sleepH = day.sleep_min === null ? null : day.sleep_min / 60
  if (sleepH !== null) {
    rows.push({
      key: 'sleep',
      label: 'Sleep',
      icon: BedtimeRounded,
      metric: 'sleep',
      value: sleepH,
      target: SLEEP_TARGET_H,
      unit: 'h',
      logged: true,
    })
  }
  // A row with no target has nothing to sit against, so it is dropped rather than drawn as a full ring.
  return rows.filter((r) => r.target > 0)
}

/**
 * How much of the goal is behind him: kilograms moved from the start weight, out of the kilograms the whole goal
 * asks for. Null when the goal is not a loss, or when either anchor is missing — the rail then shows no ring rather
 * than a number that means nothing. Pure.
 */
export function goalProgress(
  startKg: number | null,
  nowKg: number | null,
  goalKg: number | null,
): number | null {
  if (startKg === null || nowKg === null || goalKg === null) return null
  const total = startKg - goalKg
  if (total <= 0) return null
  return Math.max(0, Math.min(1, (startKg - nowKg) / total))
}

/** Where the goal stands, for the hero and the rail. kg values are trend weight; rates are kg lost per week. */
export interface GoalFacts {
  startKg: number | null
  startDate: LocalDate | null
  nowKg: number | null
  goalKg: number | null
  goalDate: LocalDate | null
  /** Share of the goal behind him, 0–1 (see `goalProgress`). */
  progress: number | null
  /** start − now and start − goal, kg. */
  doneKg: number | null
  totalKg: number | null
  /** The rate that lands the goal on its date: (now − goal) / (weeks from today to goal_date) (`paceVersusPlan`). */
  requiredRate: number | null
  /** The forecast's own rate and the date it reaches the goal. */
  forecastRate: number | null
  /** Whether the forecast lands the goal by its date: forecastRate ≥ requiredRate (`paceVersusPlan`). */
  ahead: boolean | null
  finishDate: LocalDate | null
  /** The next weight milestone not yet reached, with its forecast date. */
  nextMilestone: { label: string; date: LocalDate | null } | null
}

/** The goal facts for a window ending today (`data.to`). Pure. */
export function goalFacts(data: DashboardData): GoalFacts {
  const profile = data.profile
  const last = lastTrend(data.trend?.points ?? [])
  const nowKg = last?.kg ?? null
  const startKg = profile?.start_weight_kg ?? null
  const goalKg = profile?.goal_weight_kg ?? null
  const goalDate = profile?.goal_date ?? null
  const forecast = data.trend?.forecast ?? null
  const pace = paceVersusPlan({
    nowKg,
    goalKg,
    today: data.to,
    goalDate,
    weeklyRateKg: forecastRate(forecast),
  })
  const timelines =
    data.trend && goalKg !== null
      ? milestoneTimelines(data.trend.milestones, projectionOf(data.trend, goalKg))
      : null
  const next = timelines?.weight.find((m) => !m.reachedOn) ?? null
  return {
    startKg,
    startDate: profile?.start_date ?? null,
    nowKg,
    goalKg,
    goalDate,
    progress: goalProgress(startKg, nowKg, goalKg),
    doneKg: startKg !== null && nowKg !== null ? startKg - nowKg : null,
    totalKg: startKg !== null && goalKg !== null ? startKg - goalKg : null,
    requiredRate: pace.requiredRate,
    forecastRate: pace.forecastRate,
    ahead: pace.ahead,
    finishDate: forecast?.finish_date ?? null,
    nextMilestone: next ? { label: next.label, date: next.expectedOn ?? null } : null,
  }
}

const { summit } = tokens

/** "17 weeks early", "2 days late": the forecast finish against the goal date. */
function versusGoalDate(finish: LocalDate, goal: LocalDate): string {
  const days = daysBetween(finish, goal)
  if (days === 0) return 'right on the goal date'
  const n = Math.abs(days)
  const amount = n >= 14 ? `${Math.round(n / 7)} weeks` : `${n} ${n === 1 ? 'day' : 'days'}`
  return `${amount} ${days > 0 ? 'early' : 'late'}`
}

/** Training days from `from` to `to` inclusive, by the settings' weekdays. */
function trainingDates(from: LocalDate, to: LocalDate, trainingDays: readonly string[]): LocalDate[] {
  const out: LocalDate[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) if (trainingDays.includes(weekdayOf(d))) out.push(d)
  return out
}

/** "in 17 days", "today", "3 days overdue". */
function dueIn(date: LocalDate, today: LocalDate): string {
  const days = daysBetween(today, date)
  if (days === 0) return 'today'
  const n = Math.abs(days)
  const amount = `${n} ${n === 1 ? 'day' : 'days'}`
  return days > 0 ? `in ${amount}` : `${amount} overdue`
}

/** The deep-sky rail's row: a muted label, the value in white, an optional trailing note or chip. */
function RailRow({
  icon,
  label,
  value,
  trailing,
  testId,
}: {
  icon?: ReactNode
  label: ReactNode
  value: ReactNode
  trailing?: ReactNode
  testId?: string
}) {
  return (
    <Box
      data-testid={testId}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        py: '9px',
        minWidth: 0,
        '& + &': { borderTop: deepSkyRule },
      }}
    >
      {icon}
      <Box sx={{ flex: 1, minWidth: 0, color: summit.deepSky.muted }}>{label}</Box>
      <Box sx={{ flex: 'none', ...tabularNums, color: summit.deepSky.text, textAlign: 'right' }}>{value}</Box>
      {trailing}
    </Box>
  )
}

/** A 12 px note after a rail value ("2 left", "100 %"), muted on the deep sky unless it carries a colour. */
function Note({ children, color = summit.deepSky.muted }: { children: ReactNode; color?: string }) {
  return (
    <Box
      component="span"
      sx={{ flex: 'none', fontSize: tokens.font.size.caption, color, whiteSpace: 'nowrap', ...tabularNums }}
    >
      {children}
    </Box>
  )
}

/** The rail's status chip on the deep sky: "ahead" in the deepened teal, "behind" in the warning tint. */
function RailChip({ ahead }: { ahead: boolean }) {
  return (
    <Box
      component="span"
      sx={{
        flex: 'none',
        px: '8px',
        py: '2px',
        borderRadius: `${tokens.radius.pill}px`,
        bgcolor: ahead ? summit.pill.teal : tokens.tone.warning.bg,
        color: ahead ? summit.deepSky.text : tokens.tone.warning.text,
        fontSize: tokens.font.size.micro,
        fontWeight: tokens.font.weight.heading,
        lineHeight: '16px',
      }}
    >
      {ahead ? 'ahead' : 'behind'}
    </Box>
  )
}

/** The share of the climb done as 1d's 76 px gold ring on the deep sky, drawing from 0 on mount. */
function PlanRing({ progress }: { progress: number }) {
  const { entered, reduced } = useEntrance()
  const size = 76
  const stroke = 7
  const r = (size - stroke) / 2 - 1.5
  const c = 2 * Math.PI * r
  const percent = Math.round(progress * 100)
  return (
    <Box
      role="img"
      aria-label={`Goal progress: ${percent} %`}
      sx={{ position: 'relative', width: size, height: size, flex: 'none' }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden focusable="false">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`} fill="none" strokeLinecap="round">
          <circle cx={size / 2} cy={size / 2} r={r} stroke={summit.glass.tile} strokeWidth={stroke} />
          {progress > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={summit.gold.main}
              strokeWidth={stroke}
              strokeDasharray={`${entered ? Math.max(c * progress, 1) : 0} ${c}`}
              style={{
                transition: reduced
                  ? 'none'
                  : `stroke-dasharray ${tokens.motion.duration.grow}ms ${enterEasing()} 900ms`,
              }}
            />
          )}
        </g>
      </svg>
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          fontFamily: tokens.font.display,
          fontSize: tokens.font.size.itemTitle,
          fontWeight: tokens.font.weight.display,
          ...tabularNums,
        }}
      >
        {percent}%
      </Box>
    </Box>
  )
}

const glyph = { fontSize: 18, flex: 'none' } as const

/**
 * 1d's deep-sky "Against the plan": the gold ring for the share of the climb done beside "Ahead, week 2", the outlook
 * in one muted line, then one row per plan fact — weekly rate against the rate the summit date needs, sessions, fasts
 * this month, days logged, the next camp and the next Evolt scan — and the way to the plan history.
 */
export function GoalRail({ data, facts }: { data: DashboardData; facts: GoalFacts }) {
  const today = data.to

  const planStart = facts.startDate && facts.startDate > data.from ? facts.startDate : data.from
  const thisWeek = weekStart(today)
  const weekEnd = addDays(thisWeek, 6)
  const trainingDays = data.settings?.training_days ?? []
  const planned = trainingDays.length ? trainingDates(planStart, weekEnd, trainingDays).length : null
  const done = data.sessions.length
  // Still to do: this week's training days from today on that have no finished session (a missed day is not "left").
  const finishedOn = new Set(data.sessions.filter((s) => s.ended_at !== null).map((s) => s.date))
  const left = trainingDates(today, weekEnd, trainingDays).filter((d) => !finishedOn.has(d)).length

  const fastHours = data.settings?.fast_hours ?? DEFAULT_FAST_HOURS
  const monthStart = `${today.slice(0, 8)}01` as LocalDate
  const fastsThisMonth = data.fasts.filter(
    (f) => f.ended_at !== null && (fastDay(f, fastHours) ?? '') >= monthStart,
  ).length
  // The next planned fast, by its fast day (engine fastDay over its /api/fasts row, as Today, the strip and Log).
  const nextFast = plannedFasts(data.fasts, Date.now(), fastHours)[0] ?? null

  const logged = data.days.filter((d) => d.meals_logged > 0 || d.water_ml > 0).length
  const loggedShare = data.days.length ? logged / data.days.length : 0
  const lastScan = confirmedScans(data.scans).at(-1) ?? null
  const nextScan = lastScan
    ? addDays(lastScan.date, data.settings?.scan_interval_days ?? DEFAULT_SCAN_INTERVAL_DAYS)
    : null

  const ahead = facts.ahead
  const week = facts.startDate ? Math.floor(Math.max(0, daysBetween(facts.startDate, today)) / 7) + 1 : null
  const headline =
    week === null
      ? copy.PlanLabel
      : ahead === null
        ? `Week ${week} of ${copy.planLabel}`
        : `${ahead ? 'Ahead' : 'Behind'}, week ${week}`
  const outlook =
    facts.finishDate && facts.goalDate
      ? `Projected ${copy.goalLabel} ${formatShortDate(facts.finishDate, today)}, ${versusGoalDate(facts.finishDate, facts.goalDate)} on the goal date (${formatShortDate(facts.goalDate, today)}).`
      : facts.goalDate
        ? `Goal date ${formatShortDate(facts.goalDate, today)}. A few more weigh-ins set the forecast.`
        : 'Set a goal in Settings and the forecast starts here.'

  return (
    <DeepSkyCard component="aside" ariaLabel="Against the plan" testId="dashboard-goal-rail">
      <Box id="plan-rail" sx={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
        {facts.progress !== null && <PlanRing progress={facts.progress} />}
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ ...eyebrow, color: summit.deepSky.muted }}>Against the plan</Box>
          <Box
            component="h3"
            id="plan-rail-title"
            sx={{ m: 0, mt: '2px', ...displayTitle('card'), fontSize: 20, color: summit.deepSky.text }}
          >
            {headline}
          </Box>
        </Box>
      </Box>
      <Box
        sx={{
          mt: '10px',
          fontSize: tokens.font.size.small,
          lineHeight: tokens.font.leading.small,
          color: summit.deepSky.muted,
        }}
      >
        {facts.nowKg !== null && facts.goalKg !== null && (
          <>
            <Box component="span" data-testid="goal-to-go" sx={tabularNums}>
              {formatNumber(Math.max(0, facts.nowKg - facts.goalKg), 1)} kg to go.
            </Box>{' '}
          </>
        )}
        {outlook}
      </Box>

      <Box
        sx={{
          mt: '8px',
          fontSize: tokens.font.size.body,
          fontWeight: tokens.font.weight.body,
          lineHeight: tokens.font.leading.small,
          '& > :first-of-type': { borderTop: deepSkyRule },
        }}
      >
        <RailRow
          label="Weekly rate · forecast / needed"
          value={
            <>
              {facts.forecastRate === null ? '—' : `−${formatNumber(facts.forecastRate, 2)}`}
              {facts.requiredRate === null ? ' kg' : ` / −${formatNumber(facts.requiredRate, 2)} kg`}
            </>
          }
          trailing={ahead === null ? undefined : <RailChip ahead={ahead} />}
        />
        <RailRow
          label="Sessions"
          value={planned === null ? `${done} in this window` : `${done} / ${planned}`}
          trailing={left > 0 ? <Note>{left} left</Note> : undefined}
        />
        <RailRow
          label="Fasts"
          value={`${fastsThisMonth} / ${data.settings?.fasts_per_month ?? 2}`}
          trailing={
            nextFast ? (
              <Note color={summit.coral.main}>
                {nextFast.day === today ? 'Today' : formatWeekday(nextFast.day)}
              </Note>
            ) : undefined
          }
        />
        <RailRow
          testId="goal-adherence"
          label="Days logged"
          value={`${logged} / ${data.days.length}`}
          trailing={data.days.length ? <Note>{Math.round(loggedShare * 100)} %</Note> : undefined}
        />
        <RailRow
          icon={<FlagRounded aria-hidden sx={{ ...glyph, color: summit.gold.main }} />}
          label={copy.nextMilestone}
          value={
            facts.nextMilestone
              ? `${facts.nextMilestone.label}${facts.nextMilestone.date ? ` · ${formatShortDate(facts.nextMilestone.date, today)}` : ''}`
              : '—'
          }
        />
        <RailRow
          icon={<PieChartRounded aria-hidden sx={{ ...glyph, color: tokens.tone.success.light }} />}
          label={
            <Link
              component={RouterLink}
              to="/scans"
              underline="hover"
              sx={{
                color: 'inherit',
                '&:hover': { color: summit.deepSky.text },
                [COARSE_POINTER_QUERY]: {
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: tokens.tapTarget,
                },
              }}
            >
              Next Evolt scan
            </Link>
          }
          value={nextScan ? formatShortDate(nextScan, today) : 'None yet'}
          trailing={nextScan ? <Note>{dueIn(nextScan, today)}</Note> : undefined}
        />
      </Box>

      <Link
        component={RouterLink}
        to="/plan"
        underline="hover"
        sx={{
          mt: '12px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          minHeight: 32,
          fontSize: tokens.font.size.small,
          fontWeight: tokens.font.weight.label,
          color: summit.gold.main,
          '&:hover': { color: summit.deepSky.text },
          [COARSE_POINTER_QUERY]: { minHeight: tokens.tapTarget },
        }}
      >
        Plan history and rails
        <ArrowForwardRounded aria-hidden sx={{ fontSize: 16 }} />
      </Link>
    </DeepSkyCard>
  )
}

/**
 * A latest-day cell narrower than this (the 40 px ring, its 10 px gap and the longest value line, a four-digit
 * intake against its target, "1,688 / 1,400 kcal", about 100 px at 12 px) drops the unit: at 1200–1280 px with the
 * full sidebar, and in a phone's half-width cell. In the narrowest phone cell (320 px) the value and target wrap at
 * the slash instead of being cut. The label names the metric; the ring's accessible name keeps the unit.
 */
const CELL_UNIT_MIN = 152

/**
 * The latest day's targets — what each one stands at against its target — as a slim strip under the headline band.
 * The band itself is the window's averages; this is the one place the dashboard shows the day itself.
 */
export function LatestDay({ data }: { data: DashboardData }) {
  const day = latestTargetDay(data.days)
  const rows = goalRows(day, data.settings?.water_target_ml ?? 0)
  if (!day || rows.length === 0) return null
  return (
    <Box
      component="section"
      aria-labelledby="latest-day-title"
      sx={{
        ...cardSurface,
        display: 'grid',
        gridTemplateColumns: {
          xs: 'repeat(2, minmax(0, 1fr))',
          sm: 'repeat(3, minmax(0, 1fr))',
          lg: `minmax(0, 0.9fr) repeat(${rows.length}, minmax(0, 1fr))`,
        },
        alignItems: 'center',
        columnGap: 4,
        rowGap: 3,
        px: `${tokens.pad.card.x}px`,
        py: '18px',
      }}
    >
      <Box sx={{ gridColumn: { xs: '1 / -1', lg: 'auto' }, minWidth: 0 }}>
        <Box
          component="h3"
          id="latest-day-title"
          sx={{ m: 0, ...displayTitle('card'), fontSize: 17, color: tokens.ink.text }}
        >
          Latest day
        </Box>
        <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary }}>
          {formatWeekday(day.date)}, {formatShortDate(day.date)} against its targets
        </Box>
      </Box>
      {rows.map((row) => {
        const ratio = row.value / row.target
        return (
          <Box
            key={row.key}
            data-testid={`goal-row-${row.key}`}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              minWidth: 0,
              containerType: 'inline-size',
            }}
          >
            <MetricRing
              label={row.label}
              metric={row.metric}
              size={40}
              thickness={4}
              trackColor={tokens.ink.fill}
              value={row.value}
              target={row.target}
              unit={row.unit}
              centre={
                <Box component="span" sx={{ fontSize: tokens.font.size.micro }}>
                  {row.logged ? `${Math.min(100, Math.round(ratio * 100))}%` : '—'}
                </Box>
              }
            />
            <Box sx={{ minWidth: 0 }}>
              <Box
                sx={{
                  fontSize: tokens.font.size.small,
                  fontWeight: tokens.font.weight.label,
                  color: tokens.ink.text,
                  whiteSpace: 'nowrap',
                }}
              >
                {row.label}
              </Box>
              <Box
                sx={{
                  fontSize: tokens.font.size.caption,
                  color: tokens.ink.secondary,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {row.logged ? (
                  <>
                    {formatNumber(row.value, row.key === 'sleep' ? 1 : 0)} /{' '}
                    {formatNumber(row.target, row.key === 'sleep' ? 1 : 0)}
                  </>
                ) : (
                  'Not logged'
                )}
                {/* The label already says "Steps"; the unit would only crowd a phone's half-width cell. */}
                {row.logged && row.key !== 'steps' && (
                  <Box
                    component="span"
                    sx={{ [`@container (max-width: ${CELL_UNIT_MIN}px)`]: { display: 'none' } }}
                  >
                    {` ${row.unit}`}
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
