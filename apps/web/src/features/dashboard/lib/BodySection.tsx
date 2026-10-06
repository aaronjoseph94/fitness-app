// Owns: the Dashboard's "Body" section — weight trend with the forecast, weekly loss against the expected rate, body
// composition across Evolt scans, waist and waist-to-hip ratio from tape measurements, and the milestone timeline.
// Everything comes from the dashboard's own window: `data.trend` (GET /api/trend: points, forecast, measurements,
// milestones) and `data.scans` (GET /api/scans). Panels are `<Panel span>` slots in the section's board, so on a wide
// screen the charts sit side by side instead of stacking.
import Stack from '@mui/material/Stack'
import { useNavigate } from 'react-router'
import { MilestoneTimeline, WaistWhrChart, WeeklyLossChart, WeightTrendChart } from '../../../charts'
import { ChartCard, formatNumber } from '../../../components'
import { useUiStore } from '../../../app/ui-store'
import { confirmedScans, ScanCharts, ScanMetricGrid } from '../../scans/charts'
import { effectiveRate, forecastPath, lastTrend, milestoneTimelines, waistPoints, weeklyLoss, weightMilestones, weightPoints } from '../../progress/series'
import { DashboardSection, Panel } from './Section'
import type { DashboardData } from './useDashboardData'

/** SPEC §3: waist-to-hip ratio under 0.90. */
const WHR_TARGET = 0.9
/** SPEC §3 goal weight, used until the profile loads. */
const DEFAULT_GOAL_KG = 65
/** A window this long can carry the goal line without flattening the trend into a flat band. */
const GOAL_LINE_MIN_DAYS = 150

export function BodySection({ data }: { data: DashboardData }) {
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const navigate = useNavigate()
  const goalKg = data.profile?.goal_weight_kg ?? DEFAULT_GOAL_KG
  const subtitle = 'Trend first; the raw weigh-ins are the faint dots. Scans fill in the composition charts.'

  if (!data.trend)
    return (
      <DashboardSection id="body" title="Body" subtitle={subtitle} defaultOpen>
        <Panel span={12} mdSpan={6}>
          <ChartCard
            title="Weight trend"
            subtitle="No trend series in this window"
            empty={{ title: 'Nothing to chart yet', body: 'A morning weigh-in each day starts the trend line.', illustration: 'progress', action: { label: 'Log weigh-in', onClick: () => openQuickLog('weigh-in') } }}
            testId="dashboard-weight-trend"
          />
        </Panel>
      </DashboardSection>
    )

  const trend = data.trend
  const points = weightPoints(trend.points)
  const last = lastTrend(trend.points)
  const rate = trend.forecast?.weekly_rate_kg ?? null
  const forecast =
    last && trend.forecast
      ? forecastPath({ from: last, forecast: trend.forecast, goalKg, horizonDays: data.windowDays })
      : []
  const weighed = trend.points.some((p) => p.weight_kg !== null)
  const weeks = weeklyLoss(trend.points, rate)
  const timelines = milestoneTimelines(trend.milestones, last, last && trend.forecast ? effectiveRate(last, trend.forecast, goalKg) : null)
  const waist = waistPoints(trend.measurements)
  const scans = confirmedScans(data.scans)
  const forecastLine = trend.forecast?.finish_date
    ? `Finish ${trend.forecast.finish_date} at ${formatNumber(trend.forecast.weekly_rate_kg, 2)} kg/week`
    : `Trend and weigh-ins; goal ${formatNumber(goalKg, 0)} kg`

  return (
    // Rows of 12 tracks at `lg` (12, 5+7, 7+5, 12) and of 6 at `md` (6, 3+3, 3+3, 6): the trend line is the section's
    // hero and takes a whole row — it is the one chart whose readability grows with width — and the four panels under it
    // are paired so that each pair is of a similar height, which is what keeps a row from being half empty.
    <DashboardSection id="body" title="Body" subtitle={subtitle} defaultOpen>
      <Panel span={12} mdSpan={6}>
        <ChartCard
          title="Weight trend"
          subtitle={forecastLine}
          empty={
            weighed
              ? undefined
              : { title: 'No weigh-ins in this window', body: 'A morning weigh-in each day starts the trend line.', illustration: 'progress', action: { label: 'Log weigh-in', onClick: () => openQuickLog('weigh-in') } }
          }
          testId="dashboard-weight-trend"
        >
          {/* The goal line only on a long window: on 30 or 90 days it stretches the axis and flattens the trend. */}
          <WeightTrendChart
            points={points}
            forecast={forecast}
            goal={data.windowDays >= GOAL_LINE_MIN_DAYS ? goalKg : undefined}
            milestones={weightMilestones(trend.milestones)}
          />
        </ChartCard>
      </Panel>

      <Panel span={5} mdSpan={3}>
        <ChartCard
          title="Weekly loss vs expected"
          subtitle={rate === null ? 'Trend change per Monday–Sunday week' : `Trend change per week; expected ${formatNumber(rate, 2)} kg/week`}
          empty={weeks.length ? undefined : { title: 'No full week yet', body: 'A full Monday–Sunday week of weigh-ins draws the first bar.', illustration: 'schedule' }}
          testId="dashboard-weekly-loss"
        >
          <WeeklyLossChart weeks={weeks} />
        </ChartCard>
      </Panel>

      {/* The waist chart sits beside the weekly bars rather than far below the trend: both are simple week-by-week
          charts of about the same height, so pairing them fills that row. */}
      <Panel span={7} mdSpan={3}>
        <ChartCard
          title="Waist and WHR"
          subtitle="Weekly tape: waist at the navel and the waist-to-hip ratio"
          empty={
            waist.length
              ? undefined
              : { title: 'No tape measurements in this window', body: 'Measure waist and hips once a week and both lines start here.', illustration: 'goals' }
          }
          testId="dashboard-waist"
        >
          <WaistWhrChart points={waist} whrTarget={WHR_TARGET} />
        </ChartCard>
      </Panel>

      {/* The scan panels sit side by side rather than stacked inside one panel: the composition charts and the metric
          grid are about as tall as each other, so one beside the other fills the row instead of leaving a column of
          empty space beside a long stack. With no scans yet, one full-width card carries the empty state alone. */}
      {scans.length === 0 ? (
        <Panel span={12} mdSpan={6}>
          <ChartCard
            title="Body composition across scans"
            subtitle="Fat and lean mass, body fat % and visceral level per Evolt scan"
            empty={{
              title: 'No scans yet',
              body: 'Upload an Evolt sheet and every metric is charted here.',
              illustration: null,
              action: { label: 'Go to scans', onClick: () => void navigate('/scans') },
            }}
            testId="dashboard-scans"
          />
        </Panel>
      ) : (
        <>
          <Panel span={7} mdSpan={3}>
            <ScanCharts scans={scans} compact />
          </Panel>
          <Panel span={5} mdSpan={3}>
            <ScanMetricGrid scans={scans} />
          </Panel>
        </>
      )}

      <Panel span={12} mdSpan={6}>
        <ChartCard
          title="Milestones"
          subtitle="Reached, and forecast dates for the next ones"
          empty={
            timelines.weight.length === 0 && timelines.composition.length === 0
              ? { title: 'No milestones yet', body: 'Milestones appear here as the trend reaches them.', illustration: 'goals' }
              : undefined
          }
          testId="dashboard-milestones"
        >
          <Stack spacing={4}>
            <MilestoneTimeline milestones={timelines.weight} />
            {timelines.composition.length > 0 && <MilestoneTimeline milestones={timelines.composition} metric="fatMass" />}
          </Stack>
        </ChartCard>
      </Panel>
    </DashboardSection>
  )
}
