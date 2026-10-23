// Owns: Progress's weight cards (1d), from GET /api/trend — `WeightTrendCard` (the smoothed trend over the weigh-in
// dots, the forecast to the summit, the dashed gold plan line from base camp, the deep-ink tooltip, and a footer with
// the keys, the forecast summit date and its ± band) and `CampsCard` (the deep-sky "Camps on the way": base camp, every
// camp with its date, the next one pinging, the summit, and the way to the scans). The weekly loss card is shared with
// the Dashboard (./WeeklyLossCard); waist, scans and photos sit in the page's detail section.
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import type { LocalDate, TrendSeries } from '@fitness/shared/schemas'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router'
import type { ApiError } from '../../../api'
import { useUiStore } from '../../../app/ui-store'
import { frameHeight, WeightTrendChart } from '../../../charts'
import {
  cardSurface,
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
  forecastBandDates,
  forecastRate,
  forecastPath,
  lastTrend,
  milestoneList,
  projectionOf,
  waistPoints,
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
/** The plan's base line from base camp to the summit (series `basePlan`). */
export interface PlanLine {
  from: { date: LocalDate; kg: number }
  to: { date: LocalDate; kg: number }
  rate: number
}

/**
 * A 1d card title row: the title on the left, a 13 px muted note on its baseline and an optional link at the right
 * (wrapping under).
 */
function TitleRow({
  title,
  note,
  action,
  id,
  onDark = false,
}: {
  title: string
  note?: string
  action?: ReactNode
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
      {action}
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
      label: 'Plan line to the goal date',
      color: tokens.chart.plan,
      mark: 'dashed',
    })
  if (range === 'all') keys.push({ label: copy.GoalLabel, color: tokens.chart.goal, mark: 'line' })
  const outlook = [
    finish ? `Projected ${copy.goalLabel} ${withYear(finish)}` : null,
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
  // Camp dates sit on the forecast's line (engine projectedOn), at the one rate every page shows.
  const rate = forecastRate(data.forecast)
  const items = milestoneList(data.milestones, projectionOf(data, goalKg))
  const whrNow = waistPoints(data.measurements).at(-1)?.whr ?? null
  return (
    <DeepSkyCard testId="progress-milestones" ariaLabel={copy.milestonesTitle}>
      <TitleRow
        id="progress-camps-title"
        title={copy.milestonesTitle}
        note={rate !== null ? `at ${formatNumber(rate, 2)} kg a week forecast` : undefined}
        action={
          // Gold on the deep sky (≥ 11:1); DeepSkyCard gives it the white keyboard ring with its deep-ink band.
          <Link
            component={RouterLink}
            to="/scans"
            underline="hover"
            sx={{
              fontSize: tokens.font.size.small,
              fontWeight: tokens.font.weight.label,
              color: summit.gold.main,
              '&:hover': { color: summit.deepSky.text },
              // A 44 × 44 target on every pointer, on one line.
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: tokens.tapTarget,
              minWidth: tokens.tapTarget,
              whiteSpace: 'nowrap',
            }}
          >
            Scans
          </Link>
        }
        onDark
      />
      <Box sx={{ mt: '12px' }}>
        <MilestoneList items={items} start={start} goalKg={goalKg} whrNow={whrNow} />
      </Box>
    </DeepSkyCard>
  )
}
