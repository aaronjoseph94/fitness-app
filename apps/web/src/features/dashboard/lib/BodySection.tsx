// Owns: the Dashboard's "Body" section (2a) — a 1.6 : 1 : 1 row of the weight journey (trend so far, then the forecast
// to the goal with its milestones), weekly loss against the expected rate and the latest Evolt scan's composition, then
// a row of the waist and waist-to-hip ratio from the tape and the milestone timeline. Everything comes from the
// dashboard's own window: `data.trend` (GET /api/trend: points, forecast, measurements, milestones) and `data.scans`
// (GET /api/scans).
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import { useNavigate } from 'react-router'
import { MilestoneTimeline, WaistWhrChart, WeeklyLossChart, WeightTrendChart } from '../../../charts'
import { ChartCard, Column, Columns, formatNumber, formatShortDate, statValue } from '../../../components'
import { useUiStore } from '../../../app/ui-store'
import { tokens } from '../../../theme'
import { confirmedScans, type ConfirmedScan } from '../../scans/charts'
import { effectiveRate, forecastPath, lastTrend, milestoneTimelines, waistPoints, weeklyLoss, weightMilestones, weightPoints } from '../../progress/series'
import { DashboardSection, WIDE_ROW } from './Section'
import type { DashboardData } from './useDashboardData'

/** SPEC §3: waist-to-hip ratio under 0.90. */
const WHR_TARGET = 0.9
/** SPEC §3: body fat at or under 18 % at goal; visceral fat level 9 or lower. */
const BODY_FAT_TARGET_PCT = 18
const VISCERAL_TARGET = 9
/** SPEC §3 lean-loss guard: lean mass over this share of the loss between two scans is flagged. */
const LEAN_LOSS_GUARD_PCT = 25
/** SPEC §3 goal weight, used until the profile loads. */
const DEFAULT_GOAL_KG = 65
/** The journey chart's plot height: 2a's 150 px frame plus the x-axis band. */
const JOURNEY_HEIGHT = 190
/** The waist and WHR panels together: 110 px each, so the row stays the height of the milestone card beside it. */
const WAIST_HEIGHT = 220

export function BodySection({ data }: { data: DashboardData }) {
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const navigate = useNavigate()
  const goalKg = data.profile?.goal_weight_kg ?? DEFAULT_GOAL_KG
  const subtitle = 'Weight, the forecast, and what the scans say'
  const noWeighIns = { title: 'No weigh-ins in this window', body: 'A morning weigh-in each day starts the trend line.', action: { label: 'Log weigh-in', onClick: () => openQuickLog('weigh-in') } }

  if (!data.trend)
    return (
      <DashboardSection id="body" title="Body" subtitle={subtitle} defaultOpen>
        <ChartCard
          titleSize="card"
          fill
          title="Weight trend and forecast"
          subtitle="No trend series in this window"
          empty={{ ...noWeighIns, title: 'Nothing to chart yet' }}
          testId="dashboard-weight-trend"
        />
      </DashboardSection>
    )

  const trend = data.trend
  const points = weightPoints(trend.points)
  const last = lastTrend(trend.points)
  const rate = trend.forecast?.weekly_rate_kg ?? null
  // 2a's journey: the forecast runs on to the goal rather than stopping at the end of the window.
  const forecast = last && trend.forecast ? forecastPath({ from: last, forecast: trend.forecast, goalKg }) : []
  const weighed = trend.points.some((p) => p.weight_kg !== null)
  const weeks = weeklyLoss(trend.points, rate)
  const timelines = milestoneTimelines(trend.milestones, last, last && trend.forecast ? effectiveRate(last, trend.forecast, goalKg) : null)
  const waist = waistPoints(trend.measurements)
  const scan = confirmedScans(data.scans).at(-1) ?? null
  const band = trend.forecast && trend.forecast.weekly_rate_kg > 0
    ? Math.round(((trend.forecast.band.high - trend.forecast.band.low) / 2 / trend.forecast.weekly_rate_kg) * 100)
    : null
  const journey = trend.forecast
    ? `Trend so far, then ${formatNumber(trend.forecast.weekly_rate_kg, 2)} kg a week to ${formatNumber(goalKg, 0)} kg${band ? ` · band ±${band} %` : ''}`
    : `Trend so far; goal ${formatNumber(goalKg, 0)} kg`

  return (
    <DashboardSection id="body" title="Body" subtitle={subtitle} defaultOpen>
      <Stack spacing={4}>
        <Columns md={2} lg={WIDE_ROW.tracks} align="stretch">
          <Column span={WIDE_ROW.wide} mdSpan={2}>
            <ChartCard titleSize="card" fill title="Weight trend and forecast" subtitle={journey} empty={weighed ? null : noWeighIns} testId="dashboard-weight-trend">
              <WeightTrendChart points={points} forecast={forecast} goal={goalKg} milestones={weightMilestones(trend.milestones)} height={JOURNEY_HEIGHT} />
            </ChartCard>
          </Column>
          <Column span={WIDE_ROW.narrow} mdSpan={1}>
            <ChartCard
              titleSize="card"
              fill
              title="Weekly loss vs expected"
              subtitle={rate === null ? 'Trend change per Monday–Sunday week' : `Trend change per week · expected −${formatNumber(rate, 2)} kg`}
              empty={weeks.length ? null : { title: 'No full week yet', body: 'A full Monday–Sunday week of weigh-ins draws the first bar.' }}
              testId="dashboard-weekly-loss"
            >
              <WeeklyLossChart weeks={weeks} height={JOURNEY_HEIGHT} />
            </ChartCard>
          </Column>
          <Column span={WIDE_ROW.narrow} mdSpan={1}>
            <CompositionCard scan={scan} goalKg={goalKg} onScans={() => void navigate('/scans')} />
          </Column>
        </Columns>

        <Columns md={2} lg={WIDE_ROW.tracks} align="stretch">
          <Column span={WIDE_ROW.half} mdSpan={1}>
            <ChartCard
              titleSize="card"
              fill
              title="Waist and WHR"
              subtitle="Weekly tape: waist at the navel and the waist-to-hip ratio"
              empty={waist.length ? null : { title: 'No tape measurements in this window', body: 'Measure waist and hips once a week and both lines start here.' }}
              testId="dashboard-waist"
            >
              <WaistWhrChart points={waist} whrTarget={WHR_TARGET} height={WAIST_HEIGHT} />
            </ChartCard>
          </Column>
          <Column span={WIDE_ROW.half} mdSpan={1}>
            <ChartCard
              titleSize="card"
              fill
              title="Milestones"
              subtitle="Reached, and forecast dates for the next ones"
              empty={timelines.weight.length === 0 && timelines.composition.length === 0 ? { title: 'No milestones yet', body: 'Milestones appear here as the trend reaches them.' } : null}
              testId="dashboard-milestones"
            >
              <Stack spacing={4}>
                <MilestoneTimeline milestones={timelines.weight} />
                {timelines.composition.length > 0 && <MilestoneTimeline milestones={timelines.composition} metric="fatMass" />}
              </Stack>
            </ChartCard>
          </Column>
        </Columns>
      </Stack>
    </DashboardSection>
  )
}

const statLabel = { fontSize: tokens.font.size.caption, color: tokens.ink.secondary } as const
const statNote = { fontSize: tokens.font.size.micro, color: tokens.ink.secondary } as const

function ScanStat({ label, value, unit, note }: { label: string; value: string; unit?: string; note: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={statLabel}>{label}</Box>
      <Box sx={{ ...statValue('small'), color: tokens.ink.text }}>
        {value}
        {unit && (
          <Box component="span" sx={{ fontSize: tokens.font.size.small, fontWeight: tokens.font.weight.body, color: tokens.ink.secondary }}>
            {` ${unit}`}
          </Box>
        )}
      </Box>
      <Box sx={statNote}>{note}</Box>
    </Box>
  )
}

/**
 * The latest confirmed scan as 2a's composition card: body fat and visceral level against their SPEC §3 goals, the
 * fat / lean split as one bar, and what the goal weight means at 18 % body fat. Before the first scan, the empty slot.
 */
function CompositionCard({ scan, goalKg, onScans }: { scan: ConfirmedScan | null; goalKg: number; onScans: () => void }) {
  if (!scan)
    return (
      <ChartCard
        titleSize="card"
        fill
        title="Body composition"
        subtitle="Fat and lean mass, body fat % and visceral level per Evolt scan"
        empty={{ title: 'No scans yet', body: 'Upload an Evolt sheet and every metric is charted here.', action: { label: 'Go to scans', onClick: onScans } }}
        testId="dashboard-scans"
      />
    )
  const r = scan.record
  const fatShare = r.body_fat_mass_kg / (r.body_fat_mass_kg + r.lean_body_mass_kg)
  const fatAtGoal = (goalKg * BODY_FAT_TARGET_PCT) / 100
  return (
    <ChartCard
      titleSize="card"
      fill
      title="Body composition"
      subtitle="Fat and lean mass from the latest scan"
      action={`Evolt · ${formatShortDate(scan.date)}`}
      caption={`At goal: about ${formatNumber(fatAtGoal, 1)} kg fat and ${formatNumber(goalKg - fatAtGoal, 1)} kg lean. Lean-loss guard: flag if lean is over ${LEAN_LOSS_GUARD_PCT} % of the loss between scans.`}
      testId="dashboard-scans"
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 3 }}>
        <ScanStat label="Body fat" value={formatNumber(r.body_fat_pct, 1)} unit="%" note={`goal ≤ ${BODY_FAT_TARGET_PCT} %`} />
        <ScanStat label="Visceral level" value={formatNumber(r.visceral_fat_level)} note={`goal ≤ ${VISCERAL_TARGET}`} />
      </Box>
      <Box sx={{ ...statLabel, display: 'flex', justifyContent: 'space-between', gap: 2, mt: '14px' }}>
        <span>Fat {formatNumber(r.body_fat_mass_kg, 1)} kg</span>
        <span>Lean {formatNumber(r.lean_body_mass_kg, 1)} kg</span>
      </Box>
      <Box
        role="img"
        aria-label={`Fat ${formatNumber(r.body_fat_mass_kg, 1)} kg, lean ${formatNumber(r.lean_body_mass_kg, 1)} kg`}
        sx={{ display: 'flex', height: 10, mt: '6px', borderRadius: `${tokens.radius.pill}px`, overflow: 'hidden' }}
      >
        <Box sx={{ width: `${fatShare * 100}%`, bgcolor: tokens.metric.fatMass }} />
        <Box sx={{ flex: 1, bgcolor: tokens.metric.lean }} />
      </Box>
    </ChartCard>
  )
}
