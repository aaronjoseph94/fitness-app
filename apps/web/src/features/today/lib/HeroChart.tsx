// Owns: Today's hero chart card — the last eight weeks of weigh-ins (dots) and trend, the forecast band from the last
// trend point to the goal, the goal line and the milestones reached; skeleton, error and first-weigh-in states.
import type { Forecast, TrendSeries } from '@fitness/shared/schemas'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ApiError } from '../../../api'
import { WeightTrendChart } from '../../../charts'
import { ChartCard, formatNumber, QueryStateCard } from '../../../components'
import { forecastPath, lastTrend, weightMilestones, weightPoints } from '../../progress/series'

interface HeroChartProps {
  trend: UseQueryResult<TrendSeries, ApiError>
  /** The active plan's forecast (falls back to the trend's own). */
  forecast: Forecast | null
  goalKg: number
  onWeighIn: () => void
}

export function HeroChart({ trend, forecast, goalKg, onWeighIn }: HeroChartProps) {
  if (!trend.data) return <QueryStateCard query={trend} what="the weight trend" height={240} />

  const data = trend.data
  const rate = forecast ?? data.forecast
  const last = lastTrend(data.points)
  const path = last && rate ? forecastPath({ from: last, forecast: rate, goalKg }) : []
  const weighed = data.points.some((p) => p.weight_kg !== null)
  const subtitle = rate?.finish_date
    ? `Last 8 weeks, then ${formatNumber(rate.weekly_rate_kg, 2)} kg/week to ${formatNumber(goalKg, 0)} kg by ${rate.finish_date}`
    : `Last 8 weeks of trend and weigh-ins; goal ${formatNumber(goalKg, 0)} kg`

  return (
    <ChartCard
      title="Weight trend"
      subtitle={subtitle}
      testId="today-hero"
      empty={
        weighed
          ? undefined
          : {
              title: 'The trend starts with a weigh-in',
              body: 'Weigh in each morning after the bathroom; the line smooths out day-to-day swings.',
              illustration: 'progress',
              action: { label: 'Log weigh-in', onClick: onWeighIn },
            }
      }
    >
      <WeightTrendChart points={weightPoints(data.points)} forecast={path} goal={goalKg} milestones={weightMilestones(data.milestones)} />
    </ChartCard>
  )
}
