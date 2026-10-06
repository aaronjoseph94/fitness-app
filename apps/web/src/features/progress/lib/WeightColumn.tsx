// Owns: the "Weight and body" column of Progress — weight trend with the forecast, weekly loss vs the expected rate,
// milestones, waist and WHR from tape measurements (all from GET /api/trend), the scans section (GET /api/scans) and
// the progress photos card.
import Stack from '@mui/material/Stack'
import type { TrendSeries } from '@fitness/shared/schemas'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ApiError } from '../../../api'
import { useUiStore } from '../../../app/ui-store'
import { frameHeight, MilestoneTimeline, WaistWhrChart, WeeklyLossChart, WeightTrendChart } from '../../../charts'
import { ChartCard, formatNumber, isQueryLoading, QueryStateCard, SectionHeader } from '../../../components'
import { PhotosLink } from '../../photos'
import type { RangeKey } from './range'
import { ScansSection } from './ScansSection'
import { effectiveRate, forecastPath, lastTrend, milestoneTimelines, waistPoints, weeklyLoss, weightMilestones, weightPoints } from './series'

/** SPEC §3: waist-to-hip ratio under 0.90. */
const WHR_TARGET = 0.9

interface WeightColumnProps {
  trend: UseQueryResult<TrendSeries, ApiError>
  range: RangeKey
  rangeLength: number
  goalKg: number
}

export function WeightColumn({ trend, range, rangeLength, goalKg }: WeightColumnProps) {
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const header = <SectionHeader title="Weight and body" />
  if (!trend.data)
    return (
      <Stack spacing={4}>
        {header}
        <QueryStateCard query={trend} what="the weight trend" height={frameHeight(240)} />
        {isQueryLoading(trend) && <QueryStateCard query={trend} what="the weight trend" />}
      </Stack>
    )

  const data = trend.data
  const points = weightPoints(data.points)
  const last = lastTrend(data.points)
  const rate = data.forecast?.weekly_rate_kg ?? null
  const forecast =
    last && data.forecast
      ? forecastPath({ from: last, forecast: data.forecast, goalKg, horizonDays: range === 'all' ? undefined : rangeLength })
      : []
  const weighed = data.points.some((p) => p.weight_kg !== null)
  const weeks = weeklyLoss(data.points, rate)
  const timelines = milestoneTimelines(data.milestones, last, last && data.forecast ? effectiveRate(last, data.forecast, goalKg) : null)
  const waist = waistPoints(data.measurements)
  const forecastLine = data.forecast?.finish_date
    ? `Finish ${data.forecast.finish_date} at ${formatNumber(data.forecast.weekly_rate_kg, 2)} kg/week`
    : `Trend, weigh-ins and the goal of ${formatNumber(goalKg, 0)} kg`

  return (
    <Stack spacing={4} data-testid="progress-weight">
      {header}
      <ChartCard
        title="Weight trend"
        subtitle={forecastLine}
        empty={
          weighed
            ? undefined
            : {
                title: 'No weigh-ins in this range',
                body: 'A morning weigh-in each day starts the trend line.',
                illustration: 'progress',
                action: { label: 'Log weigh-in', onClick: () => openQuickLog('weigh-in') },
              }
        }
      >
        {/* The goal line only on "All": on 4 w / 12 w it would stretch the axis to 65 kg and flatten the trend. */}
        <WeightTrendChart
          points={points}
          forecast={forecast}
          goal={range === 'all' ? goalKg : undefined}
          milestones={weightMilestones(data.milestones)}
        />
      </ChartCard>

      <ChartCard
        title="Weekly loss vs expected"
        subtitle={rate === null ? 'Trend change per Monday–Sunday week' : `Trend change per week; expected ${formatNumber(rate, 2)} kg/week`}
        empty={weeks.length ? undefined : { title: 'No full week yet', body: 'A full Monday–Sunday week of weigh-ins draws the first bar.', illustration: 'schedule' }}
      >
        <WeeklyLossChart weeks={weeks} />
      </ChartCard>

      <ChartCard title="Milestones" subtitle="Reached and forecast">
        <Stack spacing={4}>
          <MilestoneTimeline milestones={timelines.weight} />
          {timelines.composition.length > 0 && <MilestoneTimeline milestones={timelines.composition} metric="fatMass" />}
        </Stack>
      </ChartCard>

      <ChartCard
        title="Waist and WHR"
        subtitle="Waist at the navel and the waist-to-hip ratio"
        empty={
          waist.length
            ? undefined
            : { title: 'No tape measurements in this range', body: 'Measure waist and hips once a week and both lines start here.', illustration: 'goals' }
        }
      >
        <WaistWhrChart points={waist} whrTarget={WHR_TARGET} />
      </ChartCard>

      <ScansSection />

      <PhotosLink />
    </Stack>
  )
}
