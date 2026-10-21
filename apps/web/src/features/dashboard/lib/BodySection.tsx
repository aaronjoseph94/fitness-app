// Owns: the Dashboard's body cards (1d) — `WeeklyLossCard` and `CompositionCard`, which open the row under the KPI
// tiles (weekly loss against the expected rate with the dashed gold line; the latest Evolt scan's body fat, visceral
// level and fat / lean split), and `BodySection`, the detail section further down: the weight journey (trend so far,
// then the forecast to the summit with its camps) beside the waist and waist-to-hip ratio from the tape, then the camp
// timelines. Everything comes from the dashboard's own window: `data.trend` (GET /api/trend: points, forecast,
// measurements, milestones) and `data.scans` (GET /api/scans).
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import type { Forecast } from '@fitness/shared/schemas'
import { Link as RouterLink, useNavigate } from 'react-router'
import { MilestoneTimeline, WaistWhrChart, WeeklyLossChart, WeightTrendChart } from '../../../charts'
import {
  ChartCard,
  formatNumber,
  formatShortDate,
  statValue,
  useEntrance,
  wellSurface,
  wrapCol,
  WrapRow,
} from '../../../components'
import { copy } from '../../../copy'
import { useUiStore } from '../../../app/ui-store'
import { enterEasing, metricGradient, metricTint, tokens } from '../../../theme'
import { confirmedScans } from '../../scans/charts'
import {
  effectiveRate,
  forecastPath,
  lastTrend,
  milestoneTimelines,
  waistPoints,
  weeklyLoss,
  weightMilestones,
  weightPoints,
} from '../../progress/series'
import { DashboardSection } from './Section'
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
/** The journey chart's plot height. */
const JOURNEY_HEIGHT = 220
/** The waist and WHR panels together: 110 px each, so the row ends level with the journey beside it. */
const WAIST_HEIGHT = 220
/** The weekly loss bars' plot height (1d: 150 px of bars plus their labels). */
const LOSS_HEIGHT = 170

export function BodySection({ data }: { data: DashboardData }) {
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const goalKg = data.profile?.goal_weight_kg ?? DEFAULT_GOAL_KG
  const subtitle = 'The trend, the forecast to the summit, the tape and the camps'
  const noWeighIns = {
    title: 'No weigh-ins in this window',
    body: 'A morning weigh-in each day starts the trend line.',
    action: { label: 'Log weigh-in', onClick: () => openQuickLog('weigh-in') },
  }

  if (!data.trend)
    return (
      <DashboardSection id="body" title="Body and forecast" subtitle={subtitle} defaultOpen>
        <ChartCard
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
  // The journey: the forecast runs on to the goal rather than stopping at the end of the window.
  const forecast =
    last && trend.forecast ? forecastPath({ from: last, forecast: trend.forecast, goalKg }) : []
  const weighed = trend.points.some((p) => p.weight_kg !== null)
  const timelines = milestoneTimelines(
    trend.milestones,
    last,
    last && trend.forecast ? effectiveRate(last, trend.forecast, goalKg) : null,
  )
  const waist = waistPoints(trend.measurements)
  const band = bandPercent(trend.forecast)
  const journey = trend.forecast
    ? `Trend so far, then ${formatNumber(trend.forecast.weekly_rate_kg, 2)} kg a week to the ${copy.goalLabel} at ${formatNumber(goalKg, 0)} kg${band ? ` · band ±${band} %` : ''}`
    : `Trend so far; the ${copy.goalLabel} is ${formatNumber(goalKg, 0)} kg`

  return (
    <DashboardSection id="body" title="Body and forecast" subtitle={subtitle} defaultOpen>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: `${tokens.rhythm.section}px` }}>
        <WrapRow>
          <Box sx={wrapCol(1.6)}>
            <ChartCard
              fill
              title="Weight trend and forecast"
              subtitle={journey}
              empty={weighed ? null : noWeighIns}
              testId="dashboard-weight-trend"
            >
              <WeightTrendChart
                points={points}
                forecast={forecast}
                goal={goalKg}
                milestones={weightMilestones(trend.milestones)}
                height={JOURNEY_HEIGHT}
              />
            </ChartCard>
          </Box>
          <Box sx={wrapCol(1)}>
            <ChartCard
              fill
              title="Waist and WHR"
              subtitle="Weekly tape: waist at the navel and the waist-to-hip ratio"
              empty={
                waist.length
                  ? null
                  : {
                      title: 'No tape measurements in this window',
                      body: 'Measure waist and hips once a week and both lines start here.',
                    }
              }
              testId="dashboard-waist"
            >
              <WaistWhrChart points={waist} whrTarget={WHR_TARGET} height={WAIST_HEIGHT} />
            </ChartCard>
          </Box>
        </WrapRow>
        <ChartCard
          title={copy.milestonesLabel.charAt(0).toUpperCase() + copy.milestonesLabel.slice(1)}
          subtitle="Reached, and forecast dates for the next ones"
          empty={
            timelines.weight.length === 0 && timelines.composition.length === 0
              ? { title: 'No milestones yet', body: 'Milestones appear here as the trend reaches them.' }
              : null
          }
          testId="dashboard-milestones"
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 4 }}>
            <MilestoneTimeline milestones={timelines.weight} />
            {timelines.composition.length > 0 && (
              <MilestoneTimeline milestones={timelines.composition} metric="fatMass" />
            )}
          </Box>
        </ChartCard>
      </Box>
    </DashboardSection>
  )
}

/** The forecast band's half-width as a share of its rate, in whole percent (SPEC §9: ±20 %). */
function bandPercent(forecast: Forecast | null | undefined): number | null {
  return forecast && forecast.weekly_rate_kg > 0
    ? Math.round(((forecast.band.high - forecast.band.low) / 2 / forecast.weekly_rate_kg) * 100)
    : null
}

/**
 * 1d's "Weekly loss vs expected": each whole week's loss as a wide ramp bar with its value above it, the forecast's
 * expected loss as the dashed gold line, and a subtitle saying how many weeks landed inside the ±band (the line's
 * legend, in the plan's amber).
 */
export function WeeklyLossCard({ data }: { data: DashboardData }) {
  const trend = data.trend
  const rate = trend?.forecast?.weekly_rate_kg ?? null
  const weeks = trend ? weeklyLoss(trend.points, rate) : []
  const band = bandPercent(trend?.forecast)
  const inside =
    rate !== null && band !== null
      ? weeks.filter((w) => Math.abs(-w.change - rate) <= (rate * band) / 100).length
      : null
  const share =
    inside === null || weeks.length === 0
      ? null
      : inside === weeks.length
        ? `${weeks.length === 1 ? 'The week' : weeks.length === 2 ? 'Both weeks' : `All ${weeks.length} weeks`} inside the ±${band} % band`
        : `${inside} of ${weeks.length} weeks inside the ±${band} % band`
  return (
    <ChartCard
      fill
      title="Weekly loss vs expected"
      subtitle={
        <>
          {share ?? 'Trend change per Monday–Sunday week'}
          {rate !== null && (
            <>
              {' · '}
              <Box component="span" sx={{ color: tokens.tone.warning.text }}>
                dashed line = {formatNumber(rate, 2)} kg expected
              </Box>
            </>
          )}
        </>
      }
      empty={
        weeks.length
          ? null
          : { title: 'No full week yet', body: 'A full Monday–Sunday week of weigh-ins draws the first bar.' }
      }
      testId="dashboard-weekly-loss"
    >
      <WeeklyLossChart weeks={weeks} height={LOSS_HEIGHT} legend={false} />
    </ChartCard>
  )
}

const wellLabel = {
  fontSize: tokens.font.size.caption,
  fontWeight: tokens.font.weight.heading,
  color: tokens.ink.secondary,
} as const

/** A warm well with a label, an Outfit 22 value and a goal note (amber until the goal is met, then teal). */
function ScanWell({ label, value, note, met }: { label: string; value: string; note: string; met: boolean }) {
  return (
    <Box
      sx={{
        ...wellSurface,
        borderRadius: `${tokens.summit.radius.wellLarge}px`,
        px: '16px',
        py: '14px',
        minWidth: 0,
      }}
    >
      <Box sx={wellLabel}>{label}</Box>
      <Box sx={{ mt: '4px', ...statValue('small'), lineHeight: 1.2, color: tokens.ink.text }}>{value}</Box>
      <Box
        sx={{
          fontSize: tokens.font.size.caption,
          fontWeight: tokens.font.weight.label,
          color: met ? tokens.tone.success.text : tokens.tone.warning.text,
        }}
      >
        {note}
      </Box>
    </Box>
  )
}

/**
 * The latest confirmed scan as 1d's composition card: body fat and visceral level in warm wells against their SPEC §3
 * goals, the fat / lean split as one 14 px bar (fat in its ramp, lean on the teal tint), and what the lean mass should
 * hold at the summit, with the way to the scans. Before the first scan, the empty slot.
 */
export function CompositionCard({ data }: { data: DashboardData }) {
  const navigate = useNavigate()
  const { entered, reduced } = useEntrance()
  const goalKg = data.profile?.goal_weight_kg ?? DEFAULT_GOAL_KG
  const scans = confirmedScans(data.scans)
  const scan = scans.at(-1) ?? null
  if (!scan)
    return (
      <ChartCard
        fill
        title="Body composition"
        subtitle="Fat and lean mass, body fat % and visceral level per Evolt scan"
        empty={{
          title: 'No scans yet',
          body: 'Upload an Evolt sheet and every metric is charted here.',
          action: { label: 'Go to scans', onClick: () => void navigate('/scans') },
        }}
        testId="dashboard-scans"
      />
    )
  const r = scan.record
  const fatShare = r.body_fat_mass_kg / (r.body_fat_mass_kg + r.lean_body_mass_kg)
  const fatAtGoal = (goalKg * BODY_FAT_TARGET_PCT) / 100
  const fat = `Fat ${formatNumber(r.body_fat_mass_kg, 1)} kg`
  const lean = `Lean ${formatNumber(r.lean_body_mass_kg, 1)} kg`
  return (
    <ChartCard
      fill
      title="Body composition"
      subtitle={`Evolt ${scans.length === 1 ? 'baseline' : 'scan'} · ${formatShortDate(scan.date)}`}
      testId="dashboard-scans"
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px', mt: '4px' }}>
        <ScanWell
          label="Body fat"
          value={`${formatNumber(r.body_fat_pct, 1)} %`}
          note={`goal ≤ ${BODY_FAT_TARGET_PCT} %`}
          met={r.body_fat_pct <= BODY_FAT_TARGET_PCT}
        />
        <ScanWell
          label="Visceral level"
          value={formatNumber(r.visceral_fat_level)}
          note={`goal ≤ ${VISCERAL_TARGET}`}
          met={r.visceral_fat_level <= VISCERAL_TARGET}
        />
      </Box>
      <Box
        role="img"
        aria-label={`${fat}, ${lean}`}
        sx={{
          display: 'flex',
          height: 14,
          mt: '18px',
          borderRadius: `${tokens.radius.pill}px`,
          overflow: 'hidden',
          bgcolor: metricTint('lean'),
        }}
      >
        <Box
          sx={{
            width: `${fatShare * 100}%`,
            backgroundImage: metricGradient('fat'),
            transformOrigin: 'left',
            transform: entered ? 'none' : 'scaleX(0)',
            transition: reduced ? 'none' : `transform 1400ms ${enterEasing()} 700ms`,
          }}
        />
      </Box>
      <Box
        aria-hidden
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 2,
          mt: '8px',
          fontSize: tokens.font.size.small,
          fontWeight: tokens.font.weight.label,
        }}
      >
        <Box component="span" sx={{ color: tokens.tone.danger.text }}>
          {fat}
        </Box>
        <Box component="span" sx={{ color: tokens.tone.success.text }}>
          {lean}
        </Box>
      </Box>
      <Box
        sx={{
          mt: '12px',
          fontSize: tokens.font.size.small,
          fontWeight: tokens.font.weight.label,
          lineHeight: tokens.font.leading.small,
          color: tokens.ink.secondary,
        }}
      >
        Lean should hold near {formatNumber(goalKg - fatAtGoal, 0)} kg at the {copy.goalLabel}; fat carries
        the loss. Lean-loss guard: a flag if lean is over {LEAN_LOSS_GUARD_PCT} % of the loss between scans.{' '}
        <Link component={RouterLink} to="/scans">
          Open scans
        </Link>
      </Box>
    </ChartCard>
  )
}
