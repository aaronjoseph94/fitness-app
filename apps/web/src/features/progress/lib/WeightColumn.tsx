// Owns: Progress's weight cards (1d), from GET /api/trend — `WeightTrendCard` (the smoothed trend over the weigh-in
// dots, the forecast to the summit, the dashed gold plan line from base camp, the deep-ink tooltip, and a footer with
// the keys, the forecast summit date and its ± band), `CampsCard` (the deep-sky "Camps on the way": base camp, every
// camp with its date, the next one pinging, the summit), and `WeeklyLossCard` (each whole week's loss against the
// expected rate). Waist, scans and photos sit in the page's detail section.
import Box from '@mui/material/Box'
import { isoWeek } from '@fitness/shared/engine'
import type { LocalDate, TrendSeries } from '@fitness/shared/schemas'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ApiError } from '../../../api'
import { useUiStore } from '../../../app/ui-store'
import { frameHeight, WeeklyLossChart, WeightTrendChart } from '../../../charts'
import {
  cardSurface,
  ChartCard,
  DeepSkyCard,
  displayTitle,
  EmptyState,
  formatNumber,
  formatShortDate,
  LegendChips,
  QueryStateCard,
  type LegendItem,
} from '../../../components'
import { copy } from '../../../copy'
import { tokens } from '../../../theme'
import { MilestoneList } from './MilestoneList'
import type { RangeKey } from './range'
import {
  effectiveRate,
  forecastBandDates,
  forecastPath,
  lastTrend,
  milestoneList,
  waistPoints,
  weeklyLoss,
  weightMilestones,
  weightPoints,
} from './series'

const { summit } = tokens

type Trend = UseQueryResult<TrendSeries, ApiError>

/** "2027-04-09" → "Apr 9, 2027". */
const withYear = (date: LocalDate) => `${formatShortDate(date)}, ${date.slice(0, 4)}`
/** "2027-01-03" → "Jan 3", with the year only when it is not `year`. */
const inYear = (date: LocalDate, year: string) =>
  date.startsWith(year) ? formatShortDate(date) : withYear(date)
/** "2026-W40" → "40". */
const weekNumber = (date: LocalDate) => String(Number(isoWeek(date).slice(6)))

/** The plan line from base camp to the summit (series `planLine`). */
export interface PlanLine {
  from: { date: LocalDate; kg: number }
  to: { date: LocalDate; kg: number }
  rate: number
}

/** A 1d card title row: the title on the left, a 13 px muted note on its baseline at the right (wrapping under). */
function TitleRow({
  title,
  note,
  id,
  onDark = false,
}: {
  title: string
  note?: string
  id: string
  onDark?: boolean
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: '12px', rowGap: '2px' }}>
      <Box
        component="h2"
        id={id}
        sx={{
          m: 0,
          flex: '1 1 auto',
          minWidth: 0,
          ...displayTitle('card'),
          fontSize: 20,
          color: onDark ? summit.deepSky.text : tokens.ink.text,
        }}
      >
        {title}
      </Box>
      {note && (
        <Box
          component="span"
          sx={{
            fontSize: tokens.font.size.small,
            fontWeight: tokens.font.weight.label,
            color: onDark ? summit.deepSky.muted : tokens.ink.secondary,
          }}
        >
          {note}
        </Box>
      )}
    </Box>
  )
}

const TREND_HEIGHT = 260

export function WeightTrendCard({
  trend,
  range,
  rangeLength,
  goalKg,
  plan,
}: {
  trend: Trend
  range: RangeKey
  rangeLength: number
  goalKg: number
  plan: PlanLine | null
}) {
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  if (!trend.data)
    return (
      <QueryStateCard
        query={trend}
        what="the weight trend"
        height={frameHeight(TREND_HEIGHT)}
        titleSize="card"
      />
    )
  const data = trend.data
  const points = weightPoints(data.points)
  const last = lastTrend(data.points)
  const forecast =
    last && data.forecast
      ? forecastPath({
          from: last,
          forecast: data.forecast,
          goalKg,
          // A third of the range ahead: the forecast shows where the trend is heading without taking the plot over.
          horizonDays: range === 'all' ? undefined : Math.max(7, Math.round(rangeLength / 3)),
        })
      : []
  const weighed = data.points.some((p) => p.weight_kg !== null)
  const band = last && data.forecast ? forecastBandDates(last, data.forecast, goalKg) : null
  const bandPct =
    data.forecast && data.forecast.weekly_rate_kg > 0
      ? Math.round((data.forecast.band.high / data.forecast.weekly_rate_kg - 1) * 100)
      : null
  const finish = data.forecast?.finish_date ?? null
  const year = (finish ?? band?.late ?? '').slice(0, 4)
  const keys: LegendItem[] = [
    { label: 'Trend', color: tokens.metric.weight, mark: 'line' },
    { label: 'Weigh-in', color: tokens.chart.dotRing, mark: 'ring' },
  ]
  if (forecast.length) keys.push({ label: 'Forecast', color: tokens.metric.weight, mark: 'dashed' })
  if (plan)
    keys.push({
      label: `Plan line ${formatNumber(plan.rate, 2)} kg a week`,
      color: tokens.chart.plan,
      mark: 'dashed',
    })
  if (range === 'all') keys.push({ label: copy.GoalLabel, color: tokens.chart.goal, mark: 'line' })
  const outlook = [
    finish ? `Forecast ${copy.goalLabel} ${withYear(finish)}` : null,
    band && bandPct !== null
      ? `band ±${bandPct} % ${inYear(band.early, year)} – ${inYear(band.late, year)}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Box
      component="section"
      aria-labelledby="progress-weight-title"
      data-testid="progress-weight"
      sx={{ ...cardSurface, px: `${tokens.pad.card.x}px`, py: `${tokens.pad.card.y}px`, minWidth: 0 }}
    >
      <TitleRow
        id="progress-weight-title"
        title="Weight trend"
        note="Daily weigh-ins and the smoothed trend"
      />
      <Box sx={{ mt: '18px', minWidth: 0 }}>
        {weighed ? (
          // The goal line only on "All": on 4 w / 12 w it would stretch the axis to 65 kg and flatten the trend.
          <WeightTrendChart
            points={points}
            forecast={forecast}
            plan={plan}
            goal={range === 'all' ? goalKg : undefined}
            milestones={weightMilestones(data.milestones)}
            height={TREND_HEIGHT}
            legend={false}
          />
        ) : (
          <EmptyState
            compact
            title="No weigh-ins in this range"
            body="A morning weigh-in each day starts the trend line."
            action={{ label: 'Log weigh-in', onClick: () => openQuickLog('weigh-in') }}
          />
        )}
      </Box>
      {weighed && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '8px 18px',
            mt: '18px',
            pt: '14px',
            borderTop: `1px solid ${tokens.ink.hairline}`,
            fontSize: tokens.font.size.small,
            fontWeight: tokens.font.weight.label,
            color: tokens.ink.secondary,
          }}
        >
          <LegendChips items={keys} />
          {outlook && (
            <Box component="span" sx={{ ml: 'auto', fontVariantNumeric: 'tabular-nums' }}>
              {outlook}
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}

export function CampsCard({
  trend,
  goalKg,
  start,
}: {
  trend: Trend
  goalKg: number
  /** The plan's start (profile): base camp, the list's first row. */
  start: { date: LocalDate; kg: number } | null
}) {
  if (!trend.data) return <QueryStateCard query={trend} what="the camps" height={360} titleSize="card" />
  const data = trend.data
  const last = lastTrend(data.points)
  const rate = last && data.forecast ? effectiveRate(last, data.forecast, goalKg) : null
  const items = milestoneList(data.milestones, last, rate)
  const whrNow = waistPoints(data.measurements).at(-1)?.whr ?? null
  return (
    <DeepSkyCard testId="progress-milestones" ariaLabel={copy.milestonesTitle}>
      <TitleRow
        id="progress-camps-title"
        title={copy.milestonesTitle}
        note={rate !== null ? `at ${formatNumber(rate, 2)} kg a week` : undefined}
        onDark
      />
      <Box sx={{ mt: '12px' }}>
        <MilestoneList items={items} start={start} goalKg={goalKg} whrNow={whrNow} />
      </Box>
    </DeepSkyCard>
  )
}

export function WeeklyLossCard({ trend }: { trend: Trend }) {
  if (!trend.data)
    return <QueryStateCard query={trend} what="the weekly loss" height={190} titleSize="card" />
  const rate = trend.data.forecast?.weekly_rate_kg ?? null
  const weeks = weeklyLoss(trend.data.points, rate)
  return (
    <ChartCard
      title="Weekly loss vs expected"
      titleSize="card"
      headingComponent="h3"
      action={
        weeks.length > 0 ? (
          <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
            {weeks.length === 1
              ? `Week ${weekNumber(weeks[0]!.week)}`
              : `Weeks ${weekNumber(weeks[0]!.week)}–${weekNumber(weeks.at(-1)!.week)}`}
          </Box>
        ) : undefined
      }
      empty={
        weeks.length
          ? undefined
          : { title: 'No full week yet', body: 'A full Monday–Sunday week of weigh-ins draws the first bar.' }
      }
      caption={
        rate !== null
          ? `Dashed line = ${formatNumber(rate, 2)} kg expected · trend change per Monday–Sunday week`
          : 'Trend change per Monday–Sunday week'
      }
    >
      <WeeklyLossChart weeks={weeks} height={150} legend={false} />
    </ChartCard>
  )
}
