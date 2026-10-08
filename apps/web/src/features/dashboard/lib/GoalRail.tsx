// Owns: the Dashboard's goal facts and the two panels that show them without a chart. `goalFacts` derives, from the
// window the sections below draw, where Aaron stands against the goal (start, now, goal, the share behind him, the rate
// the goal date needs, the forecast finish, the next milestone). `GoalRail` is 2a's "Against the plan" rail beside the
// headline band: an 84 px ring for the share of the goal done, then one row per plan fact (weekly rate, sessions, fasts,
// days logged, next milestone, next scan, expenditure) and the way to the plan history. `LatestDay` is the latest
// day's targets as a slim strip under the band. Everything comes from the same window, so neither can disagree with it.
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded'
import AccessibilityNewRounded from '@mui/icons-material/AccessibilityNewRounded'
import BedtimeRounded from '@mui/icons-material/BedtimeRounded'
import DirectionsWalkRounded from '@mui/icons-material/DirectionsWalkRounded'
import EggAltRounded from '@mui/icons-material/EggAltRounded'
import FitnessCenterRounded from '@mui/icons-material/FitnessCenterRounded'
import FlagOutlined from '@mui/icons-material/FlagOutlined'
import LocalFireDepartmentOutlined from '@mui/icons-material/LocalFireDepartmentOutlined'
import LocalFireDepartmentRounded from '@mui/icons-material/LocalFireDepartmentRounded'
import SpeedRounded from '@mui/icons-material/SpeedRounded'
import TaskAltRounded from '@mui/icons-material/TaskAltRounded'
import TimerOutlined from '@mui/icons-material/TimerOutlined'
import WaterDropRounded from '@mui/icons-material/WaterDropRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import type { SvgIconComponent } from '@mui/icons-material'
import { Link as RouterLink } from 'react-router'
import { addDays, daysBetween, fastDay, weekdayOf, weekStart } from '@fitness/shared/engine'
import type { DaySummary, LocalDate, TargetValues } from '@fitness/shared/schemas'
import { cardSurface, formatDayRange, formatNumber, formatShortDate, formatWeekday, MetricRing, Panel, PanelRow, StatusChip, type StatusChipTone } from '../../../components'
import { tokens, type MetricKey } from '../../../theme'
import { confirmedScans } from '../../scans/charts'
import { effectiveRate, lastTrend, milestoneTimelines } from '../../progress/series'
import type { DashboardData } from './useDashboardData'

/** SPEC §9 readiness compares sleep with 7.5 h; used only when the day carries no target. */
const SLEEP_TARGET_H = 7.5
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
}

/** The latest day's targets as rows: value, target and the share of it reached. Pure. */
export function goalRows(day: DaySummary | null, waterTargetMl: number): GoalRow[] {
  const targets: TargetValues | null = day?.targets ?? null
  if (!day || !targets) return []
  const rows: GoalRow[] = [
    { key: 'kcal', label: 'Calories', icon: LocalFireDepartmentRounded, metric: 'calories', value: Math.round(day.intake.kcal), target: targets.kcal, unit: 'kcal' },
    { key: 'protein', label: 'Protein', icon: EggAltRounded, metric: 'protein', value: Math.round(day.intake.protein_g), target: targets.protein_g, unit: 'g' },
    { key: 'water', label: 'Water', icon: WaterDropRounded, metric: 'water', value: day.water_ml, target: targets.water_ml || waterTargetMl, unit: 'ml' },
    { key: 'steps', label: 'Steps', icon: DirectionsWalkRounded, metric: 'steps', value: day.steps ?? 0, target: targets.steps, unit: 'steps' },
  ]
  const sleepH = day.sleep_min === null ? null : day.sleep_min / 60
  if (sleepH !== null) {
    rows.push({ key: 'sleep', label: 'Sleep', icon: BedtimeRounded, metric: 'sleep', value: sleepH, target: SLEEP_TARGET_H, unit: 'h' })
  }
  // A row with no target has nothing to sit against, so it is dropped rather than drawn as a full ring.
  return rows.filter((r) => r.target > 0)
}

/**
 * How much of the goal is behind him: kilograms moved from the start weight, out of the kilograms the whole goal
 * asks for. Null when the goal is not a loss, or when either anchor is missing — the rail then shows no ring rather
 * than a number that means nothing. Pure.
 */
export function goalProgress(startKg: number | null, nowKg: number | null, goalKg: number | null): number | null {
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
  /** The rate that lands the goal on its date: (now − goal) / (weeks from today to goal_date). */
  requiredRate: number | null
  /** The forecast's own rate and the date it reaches the goal. */
  forecastRate: number | null
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
  const weeksLeft = goalDate ? daysBetween(data.to, goalDate) / 7 : 0
  const timelines =
    data.trend && goalKg !== null
      ? milestoneTimelines(data.trend.milestones, last, last && forecast ? effectiveRate(last, forecast, goalKg) : null)
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
    requiredRate: nowKg !== null && goalKg !== null && weeksLeft > 0 && nowKg > goalKg ? (nowKg - goalKg) / weeksLeft : null,
    forecastRate: forecast && forecast.weekly_rate_kg > 0 ? forecast.weekly_rate_kg : null,
    finishDate: forecast?.finish_date ?? null,
    nextMilestone: next ? { label: next.label, date: next.expectedOn ?? null } : null,
  }
}

/** "Apr 9, 2027" for a date in another year, "Nov 12" in this one. */
function shortDate(date: LocalDate, today: LocalDate): string {
  return date.slice(0, 4) === today.slice(0, 4) ? formatShortDate(date) : `${formatShortDate(date)}, ${date.slice(0, 4)}`
}

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

const muted = { fontWeight: tokens.font.weight.body, color: tokens.ink.secondary } as const

/** A value: the figure in 600 ink, then its context in muted 400 ("−0.78 / −0.70 kg"). */
function Figure({ value, rest }: { value: string; rest?: string }) {
  return (
    <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
      <Box component="span" sx={{ fontWeight: tokens.font.weight.number, color: tokens.ink.text }}>
        {value}
      </Box>
      {rest && (
        <Box component="span" sx={muted}>
          {' '}
          {rest}
        </Box>
      )}
    </Box>
  )
}

function Glyph({ icon: Icon }: { icon: SvgIconComponent }) {
  return <Icon aria-hidden sx={{ fontSize: 18, color: tokens.ink.secondary, flex: 'none' }} />
}

function Chip({ tone, label }: { tone: StatusChipTone; label: string }) {
  return <StatusChip size="small" tone={tone} label={label} />
}

export function GoalRail({ data, facts }: { data: DashboardData; facts: GoalFacts }) {
  const today = data.to
  const percent = facts.progress === null ? null : Math.round(facts.progress * 100)

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
  const fastsThisMonth = data.fasts.filter((f) => f.ended_at !== null && (fastDay(f, fastHours) ?? '') >= monthStart).length
  const nextFast = data.fasts
    .filter((f) => f.ended_at === null && Date.parse(f.started_at) > Date.now())
    .map((f) => fastDay(f, fastHours))
    .filter((d): d is LocalDate => d !== null)
    .sort()[0]

  const logged = data.days.filter((d) => d.meals_logged > 0 || d.water_ml > 0).length
  const loggedShare = data.days.length ? logged / data.days.length : 0
  const lastScan = confirmedScans(data.scans).at(-1) ?? null
  const nextScan = lastScan ? addDays(lastScan.date, data.settings?.scan_interval_days ?? DEFAULT_SCAN_INTERVAL_DAYS) : null
  const tdee = data.trend?.forecast?.tdee_est ?? null

  const ahead = facts.forecastRate !== null && facts.requiredRate !== null ? facts.forecastRate >= facts.requiredRate : null
  const outlook =
    facts.finishDate && facts.goalDate
      ? `At this rate the goal lands ${shortDate(facts.finishDate, today)}, ${versusGoalDate(facts.finishDate, facts.goalDate)}.`
      : facts.goalDate
        ? `The goal date is ${shortDate(facts.goalDate, today)}. A few more weigh-ins set the forecast.`
        : 'Set a goal in Settings and the forecast starts here.'

  return (
    <Panel
      tone="panel"
      component="aside"
      id="plan-rail"
      title="Against the plan"
      headingComponent="h3"
      description={`Since ${formatShortDate(planStart)} · this week ${formatDayRange(thisWeek, weekEnd)}`}
      testId="dashboard-goal-rail"
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 4, mt: '4px' }}>
        {percent !== null && facts.progress !== null && (
          <MetricRing
            label="Goal progress"
            metric="weight"
            color={tokens.accent.main}
            trackColor={tokens.ink.border}
            size={84}
            thickness={8}
            value={Math.round(facts.progress * 1000) / 10}
            target={100}
            unit="%"
            centre={`${percent}%`}
            delay={300}
          />
        )}
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.heading, color: tokens.ink.text, fontVariantNumeric: 'tabular-nums' }}>
            {formatNumber(facts.doneKg, 1)} of {formatNumber(facts.totalKg, 1)} kg
          </Box>
          {/* What is still to go opens the outlook, where 2a says where he stands against the forecast line. */}
          <Box sx={{ mt: '2px', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.secondary }}>
            {facts.nowKg !== null && facts.goalKg !== null && (
              <>
                <Box component="span" data-testid="goal-to-go" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatNumber(Math.max(0, facts.nowKg - facts.goalKg), 1)} kg to go.
                </Box>{' '}
              </>
            )}
            {outlook}
          </Box>
        </Box>
      </Box>

      <Box sx={{ mt: 4, borderTop: `1px solid ${tokens.ink.border}` }}>
        <PanelRow
          hairline={tokens.ink.border}
          leading={<Glyph icon={SpeedRounded} />}
          label="Weekly rate"
          value={
            <Figure
              value={facts.forecastRate === null ? '—' : `−${formatNumber(facts.forecastRate, 2)}`}
              rest={facts.requiredRate === null ? 'kg' : `/ −${formatNumber(facts.requiredRate, 2)} kg`}
            />
          }
          trailing={ahead === null ? undefined : <Chip tone={ahead ? 'success' : 'warning'} label={ahead ? 'ahead' : 'behind'} />}
        />
        <PanelRow
          hairline={tokens.ink.border}
          leading={<Glyph icon={FitnessCenterRounded} />}
          label="Sessions"
          value={<Figure value={String(done)} rest={planned === null ? 'in this window' : `/ ${planned} planned`} />}
          trailing={left > 0 ? <Chip tone="neutral" label={`${left} left`} /> : undefined}
        />
        <PanelRow
          hairline={tokens.ink.border}
          leading={<Glyph icon={TimerOutlined} />}
          label="Fasts this month"
          value={<Figure value={String(fastsThisMonth)} rest={`/ ${data.settings?.fasts_per_month ?? 2}`} />}
          trailing={nextFast ? <Chip tone="warning" label={formatWeekday(nextFast)} /> : undefined}
        />
        <PanelRow
          hairline={tokens.ink.border}
          testId="goal-adherence"
          leading={<Glyph icon={TaskAltRounded} />}
          label="Days logged"
          value={<Figure value={String(logged)} rest={`/ ${data.days.length}`} />}
          trailing={data.days.length ? <Chip tone={loggedShare >= LOGGED_GOOD_SHARE ? 'success' : 'warning'} label={`${Math.round(loggedShare * 100)}%`} /> : undefined}
        />
        <PanelRow
          hairline={tokens.ink.border}
          leading={<Glyph icon={FlagOutlined} />}
          label="Next milestone"
          value={
            facts.nextMilestone ? (
              <Figure value={facts.nextMilestone.label} rest={facts.nextMilestone.date ? `· ${shortDate(facts.nextMilestone.date, today)}` : undefined} />
            ) : (
              <Figure value="—" />
            )
          }
        />
        <PanelRow
          hairline={tokens.ink.border}
          leading={<Glyph icon={AccessibilityNewRounded} />}
          label="Next Evolt scan"
          value={
            nextScan ? (
              <Figure value={shortDate(nextScan, today)} rest={`· ${dueIn(nextScan, today)}`} />
            ) : (
              <Figure value="None yet" />
            )
          }
        />
        <PanelRow
          hairline={tokens.ink.border}
          leading={<Glyph icon={LocalFireDepartmentOutlined} />}
          label="Expenditure estimate"
          value={<Figure value={formatNumber(tdee)} rest="kcal" />}
        />
      </Box>

      <Button
        component={RouterLink}
        to="/plan"
        variant="text"
        size="small"
        endIcon={<ArrowForwardRounded />}
        sx={{ mt: 2, ml: '-8px' }}
      >
        Plan history and rails
      </Button>
    </Panel>
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
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', lg: `minmax(0, 0.9fr) repeat(${rows.length}, minmax(0, 1fr))` },
        alignItems: 'center',
        columnGap: 4,
        rowGap: 3,
        px: `${tokens.pad.card.x}px`,
        py: '14px',
      }}
    >
      <Box sx={{ gridColumn: { xs: '1 / -1', lg: 'auto' }, minWidth: 0 }}>
        <Box component="h3" id="latest-day-title" sx={{ m: 0, fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.heading, color: tokens.ink.text }}>
          Latest day
        </Box>
        <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary }}>
          {formatWeekday(day.date)}, {formatShortDate(day.date)} against its targets
        </Box>
      </Box>
      {rows.map((row) => {
        const ratio = row.value / row.target
        return (
          <Box key={row.key} data-testid={`goal-row-${row.key}`} sx={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, containerType: 'inline-size' }}>
            <MetricRing
              label={row.label}
              metric={row.metric}
              size={40}
              thickness={4}
              trackColor={tokens.ink.fill}
              value={row.value}
              target={row.target}
              unit={row.unit}
              centre={<Box component="span" sx={{ fontSize: tokens.font.size.micro }}>{`${Math.min(100, Math.round(ratio * 100))}%`}</Box>}
            />
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ fontSize: tokens.font.size.small, fontWeight: tokens.font.weight.label, color: tokens.ink.text, whiteSpace: 'nowrap' }}>{row.label}</Box>
              <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary, fontVariantNumeric: 'tabular-nums' }}>
                {formatNumber(row.value, row.key === 'sleep' ? 1 : 0)} / {formatNumber(row.target, row.key === 'sleep' ? 1 : 0)}
                {/* The label already says "Steps"; the unit would only crowd a phone's half-width cell. */}
                {row.key !== 'steps' && (
                  <Box component="span" sx={{ [`@container (max-width: ${CELL_UNIT_MIN}px)`]: { display: 'none' } }}>
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
