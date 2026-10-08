// Owns: Today's weight trend card (2a) — the headline row (trend weight, change since the start, today's weigh-in), the
// chart of daily weigh-ins (dots) and the smoothed trend over the window, then the forecast band from the last trend
// point to the goal, the goal line and the milestones reached (SPEC §6), and the four-stat footer (./TodayHeader);
// skeleton, error and first-weigh-in states.
import Box from '@mui/material/Box'
import type { Forecast, TrendSeries } from '@fitness/shared/schemas'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ApiError } from '../../../api'
import { WeightTrendChart } from '../../../charts'
import { ChartCard, formatNumber, formatShortDate, QueryStateCard } from '../../../components'
import { forecastPath, lastTrend, weightMilestones, weightPoints } from '../../progress/series'
import { TrendFacts, TrendHeadline, type TrendNumbers } from './TodayHeader'

/** The block under the title while the trend loads (headline, chart, footer), so nothing below moves. */
const BODY_HEIGHT = 400

interface HeroChartProps extends Omit<TrendNumbers, 'forecast'> {
  trend: UseQueryResult<TrendSeries, ApiError>
  /** The active plan's forecast (falls back to the trend's own). */
  forecast: Forecast | null
  onWeighIn: () => void
}

export function HeroChart({ trend, forecast, onWeighIn, ...numbers }: HeroChartProps) {
  if (!trend.data) return <QueryStateCard query={trend} what="the weight trend" height={BODY_HEIGHT} />

  const data = trend.data
  const first = data.points.find((p) => p.weight_kg !== null || p.trend_kg !== null)
  const facts: TrendNumbers = { ...numbers, forecast: forecast ?? data.forecast }
  const last = lastTrend(data.points)
  const path =
    last && facts.forecast
      ? forecastPath({ from: last, forecast: facts.forecast, goalKg: numbers.goalKg })
      : []

  return (
    <ChartCard
      title="Weight trend"
      headingComponent="h2"
      subtitle={`Daily weigh-ins and the smoothed trend${first ? ` since ${formatShortDate(first.date)}` : ''}${path.length ? `, then the forecast to ${formatNumber(numbers.goalKg, 0)} kg` : ''}`}
      testId="today-hero"
      footer={<TrendFacts {...facts} />}
      empty={
        data.points.some((p) => p.weight_kg !== null)
          ? undefined
          : {
              title: 'The trend starts with a weigh-in',
              body: 'Weigh in each morning; the line smooths out day-to-day swings.',
              action: { label: 'Log weigh-in', onClick: onWeighIn },
            }
      }
    >
      <TrendHeadline {...facts} />
      <Box sx={{ mt: '18px' }}>
        <WeightTrendChart
          points={weightPoints(data.points)}
          forecast={path}
          goal={numbers.goalKg}
          milestones={weightMilestones(data.milestones)}
          legend={false}
        />
      </Box>
    </ChartCard>
  )
}
