// Owns: the weekly report's layout (SPEC §8, §11 print) — header with week and trend, stat strip, the review (narrative,
// highlights, concerns), weight trend with the review week's forecast band and milestones, weekly loss vs expected and
// the milestone timeline, intake vs target, macros, water, steps, sleep, training volume (muscle map + weekly volume),
// PRs, fasts, scan deltas when a scan fell in the week, the proposals with their status, and next week's plan. Charts
// take fixed widths on paper (`fixed`) and fill their panel on screen. On paper the weight trend is full width and the
// rest sit in two columns, so a week prints on two Letter pages; a scan week drops weekly loss and milestones from
// paper to make room for the scan panel.
import Box from '@mui/material/Box'
import { localDate } from '@fitness/shared/engine'
import type { DaySummary, ReviewProposal, TrendSeries, WeekPlan, WeeklyMetrics, WeeklyReview } from '@fitness/shared/schemas'
import {
  CaloriesChart,
  MacrosChart,
  MilestoneTimeline,
  SegmentalFatChart,
  SleepChart,
  StepsChart,
  TrainingVolumeChart,
  WaterChart,
  WeeklyLossChart,
  WeightTrendChart,
} from '../../../charts'
import { formatNumber, formatShortDate, formatSigned, formatWeekday } from '../../../components'
import { MuscleMap, MuscleMapLegend } from '../../../muscle-map'
import { tokens } from '../../../theme'
import { Muted, Pair, Panel, PRINT_FULL, PRINT_HALF, StatStrip, Table, type Stat } from './parts'
import { forecastPath, lastTrend, milestoneTimelines, weeklyLoss, weightMilestones } from '../../progress/series'
import {
  caloriesDays,
  macrosDays,
  mapLevels,
  planRows,
  sleepNights,
  stepsDays,
  volumeWeeks,
  VOLUME_GROUPS,
  waterDays,
  weekTargets,
  weightPoints,
} from './series'

export interface WeeklyReportProps {
  week: string
  from: string
  to: string
  review: WeeklyReview | null
  metrics: WeeklyMetrics
  days: readonly DaySummary[]
  trend: TrendSeries | null
  history: readonly WeeklyReview[]
  nextPlan: WeekPlan | null
  nextStart: string
  /** Where the forecast band stops; null (settings not loaded) draws no band. */
  goalKg: number | null
  /** Lay out for paper: fixed chart widths. */
  fixed: boolean
}

/** How far the forecast band reaches past the week's last trend point. */
const FORECAST_DAYS = 14

const AUTHOR_TEXT = { claude_mcp: 'Claude review', gemini: 'Gemini draft' } as const
const SEGMENT_LABELS = { left_arm: 'Left arm', right_arm: 'Right arm', torso: 'Torso', left_leg: 'Left leg', right_leg: 'Right leg' } as const
const STATUS = {
  pending: { text: 'Pending', color: tokens.status.warning },
  accepted: { text: 'Accepted', color: tokens.status.good },
  auto_applied: { text: 'Applied', color: tokens.status.good },
  rejected: { text: 'Rejected', color: tokens.ink.secondary },
} as const
const FIELD_TEXT = { kcal: 'kcal', protein_g: 'protein g', carbs_g: 'carbs g', fat_g: 'fat g', fibre_g: 'fibre g', water_ml: 'water ml', steps: 'steps' } as const

const hours = (min: number | null) => (min === null ? '—' : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`)
const pct = (share: number) => `${Math.round(share * 100)} %`
const kg = (v: number | null, dp = 1) => (v === null ? '—' : `${formatNumber(v, dp)} kg`)

export function weekTitle(from: string, to: string) {
  return `${formatShortDate(from)} – ${formatShortDate(to)}, ${to.slice(0, 4)}`
}

export function WeeklyReport(props: WeeklyReportProps) {
  const { week, from, to, review, metrics: m, days, trend, history, nextPlan, nextStart, goalKg, fixed } = props
  const full = fixed ? PRINT_FULL : undefined
  const half = fixed ? PRINT_HALF : undefined
  const targets = weekTargets(days)
  // The review week's forecast, drawn two weeks past the week's last trend point.
  const last = trend ? lastTrend(trend.points) : null
  const rate = m.forecast?.weekly_rate_kg ?? null
  const forecast = last && m.forecast && goalKg !== null ? forecastPath({ from: last, forecast: m.forecast, goalKg, horizonDays: FORECAST_DAYS }) : []
  const losses = trend ? weeklyLoss(trend.points, rate) : []
  const timeline = trend ? milestoneTimelines(trend.milestones, last, rate).weight : []
  // A scan week needs the room on paper for its scan panel (two Letter pages).
  const lossAndMilestones = !fixed || !m.scan
  const stats: Stat[] = [
    { label: 'Trend', value: kg(m.trend_end_kg), detail: m.trend_change_kg === null ? 'no change yet' : `${formatSigned(m.trend_change_kg, 1)} kg this week` },
    { label: 'Intake', value: `${formatNumber(m.intake_avg.kcal)} kcal`, detail: m.target_kcal_avg === null ? `${m.days_logged} days logged` : `target ${formatNumber(m.target_kcal_avg)}` },
    { label: 'Protein', value: `${formatNumber(m.intake_avg.protein_g)} g`, detail: `on target ${pct(m.protein_adherence)}` },
    { label: 'Water', value: `${formatNumber(m.water_avg_ml)} ml`, detail: 'daily average' },
    { label: 'Steps', value: formatNumber(m.steps_avg), detail: 'daily average' },
    { label: 'Sleep', value: hours(m.sleep_avg_min), detail: 'nightly average' },
    { label: 'Sessions', value: `${m.sessions_done} / ${m.sessions_planned}`, detail: `${formatNumber(m.volume_kg)} kg lifted` },
    { label: 'Logging', value: pct(m.logging_adherence), detail: 'adherent days' },
  ]

  return (
    <Box sx={{ display: 'grid', gap: 2, '@media print': { gap: 1.5 } }}>
      <Box component="header" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 2, breakInside: 'avoid' }}>
        <Box sx={{ mr: 'auto' }}>
          <Box className="report-secondary" sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary, letterSpacing: 0.3 }}>
            WEEKLY REPORT · {week}
          </Box>
          <Box component="h1" sx={{ m: 0, fontSize: 24, fontWeight: tokens.font.weight.heading, lineHeight: 1.2 }}>
            {weekTitle(from, to)}
          </Box>
          <Box className="report-secondary" sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary, mt: 0.5 }} data-testid="report-author">
            {review ? `${AUTHOR_TEXT[review.author]} · updated ${review.updated_at.slice(0, 10)}` : 'No review yet · engine metrics only'}
          </Box>
        </Box>
        <Box sx={{ textAlign: 'right' }} data-testid="report-trend">
          <Box sx={{ fontSize: 28, fontWeight: tokens.font.weight.number, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1, color: tokens.metric.weight }}>
            {kg(m.trend_end_kg)}
          </Box>
          <Box className="report-secondary" sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary }}>
            trend {m.trend_change_kg === null ? '' : `${formatSigned(m.trend_change_kg, 1)} kg · `}
            {m.forecast ? `${formatNumber(m.forecast.weekly_rate_kg, 2)} kg/wk${m.forecast.finish_date ? ` · finish ${m.forecast.finish_date}` : ''}` : 'no forecast'}
          </Box>
        </Box>
      </Box>

      <StatStrip stats={stats} />

      <ReviewPanel review={review} metrics={m} />

      <ProposalsPanel proposals={review?.proposals ?? []} hasReview={review !== null} />

      <Panel title="Weight trend" subtitle="Daily weigh-ins and the trend (EWMA), three weeks before and this week" testId="report-weight">
        {trend && trend.points.some((p) => p.trend_kg !== null) ? (
          <WeightTrendChart
            points={weightPoints(trend.points)}
            forecast={forecast}
            milestones={weightMilestones(trend.milestones)}
            width={full}
            height={fixed ? 120 : 200}
            legend={!fixed}
          />
        ) : (
          <Muted>No weigh-ins yet.</Muted>
        )}
      </Panel>

      {lossAndMilestones && (
        <Pair>
          <Panel
            title="Weekly loss vs expected"
            subtitle={rate === null ? 'Trend change per Monday–Sunday week' : `Trend change per week; expected ${formatNumber(rate, 2)} kg/week`}
            testId="report-weekly-loss"
          >
            {losses.length ? <WeeklyLossChart weeks={losses} width={half} height={fixed ? 80 : 160} legend={!fixed} /> : <Muted>No full week of weigh-ins yet.</Muted>}
          </Panel>
          <Panel title="Milestones" subtitle="Reached, and forecast dates for the next ones" testId="report-milestones">
            {timeline.length ? <MilestoneTimeline milestones={timeline} width={half} /> : <Muted>No weight milestones set.</Muted>}
          </Panel>
        </Pair>
      )}

      <Pair>
        <Panel title="Intake vs target" subtitle="kcal per day by meal slot; dashed line is the target" testId="report-calories">
          <CaloriesChart days={caloriesDays(days)} target={targets?.kcal} width={half} height={fixed ? 110 : 200} />
        </Panel>
        <Panel title="Macros" subtitle="g per day; dashed line is the protein target" testId="report-macros">
          <MacrosChart days={macrosDays(days)} proteinTarget={targets?.protein_g} width={half} height={fixed ? 110 : 200} />
        </Panel>
      </Pair>

      <Pair>
        <Panel title="Water" subtitle={`ml per day · average ${formatNumber(m.water_avg_ml)} ml`} testId="report-water">
          <WaterChart days={waterDays(days)} target={targets?.water_ml} width={half} height={fixed ? 72 : 160} legend={!fixed} />
        </Panel>
        <Panel title="Steps" subtitle={`per day · average ${formatNumber(m.steps_avg)}`} testId="report-steps">
          <StepsChart days={stepsDays(days)} target={targets?.steps} width={half} height={fixed ? 72 : 160} legend={!fixed} />
        </Panel>
      </Pair>

      <Pair>
        <Panel title="Sleep" subtitle={`Hours asleep and bedtime · average ${hours(m.sleep_avg_min)}`} testId="report-sleep">
          <SleepChart nights={sleepNights(days)} target={7.5} width={half} height={fixed ? 140 : 240} legend={!fixed} />
        </Panel>
        <MusclePanel metrics={m} fixed={fixed} />
      </Pair>

      <Pair>
        <Panel title="Training volume per week" subtitle="Sets × reps × kg by muscle group, last reviewed weeks" testId="report-volume">
          <TrainingVolumeChart weeks={volumeWeeks(m, history.map((r) => r.metrics))} groups={VOLUME_GROUPS} width={half} height={fixed ? 100 : 200} legend />
        </Panel>
        <Box sx={{ display: 'grid', gap: 2, alignContent: 'start', '@media print': { gap: 1.5 } }}>
          <PrsPanel metrics={m} />
          <FastsPanel metrics={m} />
        </Box>
      </Pair>

      {m.scan && <ScanPanel scan={m.scan} half={half} fixed={fixed} />}

      <NextWeekPanel plan={nextPlan} nextStart={nextStart} />
    </Box>
  )
}

function ReviewPanel({ review, metrics }: { review: WeeklyReview | null; metrics: WeeklyMetrics }) {
  if (!review)
    return (
      <Panel title="Review" testId="report-review">
        <Muted>
          No review for this week yet. The Gemini draft runs Sunday at 20:00; a Claude review through the connector replaces it.
          {metrics.flags.length > 0 && ` Flags: ${metrics.flags.map((f) => f.message).join('; ')}.`}
        </Muted>
      </Panel>
    )
  return (
    <Panel title="Review" subtitle={AUTHOR_TEXT[review.author]} testId="report-review">
      <Box sx={{ fontSize: tokens.font.size.small, lineHeight: 1.5, whiteSpace: 'pre-line', '@media print': { fontSize: 11, lineHeight: 1.35 } }} data-testid="report-narrative">
        {review.narrative}
      </Box>
      {(review.highlights.length > 0 || review.concerns.length > 0) && (
        <Box sx={{ mt: 1.5, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, '@media print': { gridTemplateColumns: '1fr 1fr', gap: 1.5 } }}>
          <Bullets title="Highlights" items={review.highlights} color={tokens.status.good} />
          <Bullets title="Concerns" items={review.concerns} color={tokens.status.warning} />
        </Box>
      )}
    </Panel>
  )
}

function Bullets({ title, items, color }: { title: string; items: readonly string[]; color: string }) {
  if (!items.length) return <Box />
  return (
    <Box>
      <Box sx={{ fontSize: tokens.font.size.caption, fontWeight: tokens.font.weight.label, color }}>{title}</Box>
      <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5, fontSize: tokens.font.size.label, lineHeight: 1.45, '@media print': { fontSize: 11 } }}>
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </Box>
    </Box>
  )
}

function MusclePanel({ metrics: m, fixed }: { metrics: WeeklyMetrics; fixed: boolean }) {
  const trained = Object.values(m.muscle_scores).some((v) => (v ?? 0) > 0)
  return (
    <Panel title="Training volume map" subtitle={`${m.sessions_done} of ${m.sessions_planned} sessions · sets per muscle`} testId="report-muscle-map">
      {trained ? (
        <Box sx={{ display: 'grid', justifyItems: 'center', gap: 1 }}>
          <MuscleMap levels={mapLevels(m.muscle_scores)} size={fixed ? 140 : undefined} title={`Muscles trained in ${m.week}`} />
          <MuscleMapLegend dense />
        </Box>
      ) : (
        <Muted>No finished sessions this week.</Muted>
      )}
    </Panel>
  )
}

function PrsPanel({ metrics: m }: { metrics: WeeklyMetrics }) {
  return (
    <Panel title="PRs" subtitle="Personal records set this week" testId="report-prs">
      {m.prs.length ? (
        <Table
          head={['Exercise', 'Set', 'e1RM', 'Before']}
          rows={m.prs.slice(0, 5).map((p) => [
            p.exercise_name,
            `${p.reps} × ${formatNumber(p.load_kg, 1)} kg`,
            `${formatNumber(p.e1rm_kg, 1)} kg`,
            p.previous_best_kg === null ? '—' : `${formatNumber(p.previous_best_kg, 1)} kg`,
          ])}
        />
      ) : (
        <Muted>No PRs this week.</Muted>
      )}
    </Panel>
  )
}

function FastsPanel({ metrics: m }: { metrics: WeeklyMetrics }) {
  return (
    <Panel title="Fasts" subtitle="24 h fasts started this week" testId="report-fasts">
      {m.fasts.length ? (
        <Table
          head={['Started', 'Hours', 'Status']}
          rows={m.fasts.map((f) => [
            `${formatWeekday(localDate(f.started_at))} ${localDate(f.started_at)}`,
            formatNumber(f.hours, 1),
            f.status === 'completed' ? 'Completed' : f.status === 'partial' ? 'Ended early' : 'Running',
          ])}
        />
      ) : (
        <Muted>No fasts this week.</Muted>
      )}
    </Panel>
  )
}

function ScanPanel({ scan, half, fixed }: { scan: NonNullable<WeeklyMetrics['scan']>; half?: number; fixed: boolean }) {
  const guard = { ok: 'Lean-loss guard: ok', hydration: 'Lean drop matched by water (hydration)', lean_loss: 'Lean-loss guard: flagged' }[scan.lean_loss]
  const fromTo = (v: { from: number; to: number } | null, dp: number, unit = '') =>
    v ? `${formatNumber(v.from, dp)} → ${formatNumber(v.to, dp)}${unit}` : '—'
  return (
    <Pair>
      <Panel title="Scan deltas" subtitle={`Scan ${scan.date} vs ${scan.previous_date} (${scan.days} days)`} printSubtitle testId="report-scan">
        <Table
          head={['Measure', 'Change', 'Measure', 'Change']}
          rows={[
            ['Weight', `${formatSigned(scan.fat_vs_lean.weight_kg, 1)} kg`, 'Fat mass', `${formatSigned(scan.fat_vs_lean.fat_kg, 1)} kg`],
            ['Lean mass', `${formatSigned(scan.fat_vs_lean.lean_kg, 1)} kg`, 'Body water', `${formatSigned(scan.fat_vs_lean.water_kg, 1)} kg`],
            ['Body fat', fromTo(scan.body_fat_pct, 1, ' %'), 'Visceral', fromTo(scan.visceral_fat_level, 0)],
          ]}
        />
        <Box sx={{ mt: 1, fontSize: tokens.font.size.caption, color: scan.lean_loss === 'lean_loss' ? tokens.status.flag : tokens.ink.secondary }}>
          {guard}
          {scan.milestones_reached.length > 0 && ` · Reached: ${scan.milestones_reached.join(', ')}`}
        </Box>
      </Panel>
      <Panel title="Segmental fat" subtitle="Fat kg per segment, previous scan vs this one" testId="report-segments">
        <SegmentalFatChart
          segments={scan.segments.map((s) => ({ segment: SEGMENT_LABELS[s.segment], baseline: s.fat_from, latest: s.fat_to }))}
          baselineLabel={scan.previous_date}
          latestLabel={scan.date}
          width={half}
          height={fixed ? 34 + scan.segments.length * 23 : undefined}
        />
      </Panel>
    </Pair>
  )
}

function changeText(p: ReviewProposal) {
  const field = FIELD_TEXT[p.field]
  return `${p.weekday ? `${p.weekday[0]!.toUpperCase()}${p.weekday.slice(1)}` : 'Daily'} ${field} ${formatNumber(p.from)} → ${formatNumber(p.to)}`
}

function ProposalsPanel({ proposals, hasReview }: { proposals: readonly ReviewProposal[]; hasReview: boolean }) {
  return (
    <Panel title="Proposals" subtitle="Plan changes from this review and where they stand" testId="report-proposals">
      {proposals.length ? (
        <Table
          head={['Change', 'Why', 'Status']}
          rows={proposals.map((p) => [
            <Box key="c" sx={{ whiteSpace: 'nowrap' }}>
              {changeText(p)}
              {p.note && (
                <Box className="report-secondary" sx={{ fontSize: 11, color: tokens.ink.secondary, whiteSpace: 'normal' }}>
                  {p.note}
                </Box>
              )}
            </Box>,
            p.reason,
            <Box key="s" component="span" sx={{ color: STATUS[p.status].color, fontWeight: tokens.font.weight.label, whiteSpace: 'nowrap' }}>
              {STATUS[p.status].text}
            </Box>,
          ])}
        />
      ) : (
        <Muted>{hasReview ? 'No plan changes proposed this week.' : 'Proposals arrive with the review.'}</Muted>
      )}
    </Panel>
  )
}

function NextWeekPanel({ plan, nextStart }: { plan: WeekPlan | null; nextStart: string }) {
  return (
    <Panel
      title="Next week's plan"
      subtitle={plan ? `Week of ${nextStart} · ${plan.status} · by ${plan.author === 'claude_mcp' ? 'Claude' : plan.author === 'gemini' ? 'Gemini' : 'you'}` : `Week of ${nextStart}`}
      printSubtitle
      testId="report-next-plan"
    >
      {plan ? (
        <>
          {plan.plan.focus_note && <Box sx={{ fontSize: tokens.font.size.label, mb: 1, '@media print': { fontSize: 11 } }}>{plan.plan.focus_note}</Box>}
          <PlanGrid rows={planRows(plan)} />
          <Muted>
            Water {formatNumber(plan.plan.water_ml)} ml · steps {formatNumber(plan.plan.steps)}
            {plan.plan.scan_date ? ` · scan ${plan.plan.scan_date}` : ''}
          </Muted>
        </>
      ) : (
        <Muted>No plan yet.</Muted>
      )}
    </Panel>
  )
}

/** Next week as seven columns (day, kcal, protein, session): three short rows instead of seven. */
function PlanGrid({ rows }: { rows: ReturnType<typeof planRows> }) {
  return (
    <Table
      testId="report-plan-grid"
      head={['', ...rows.map((r) => `${formatWeekday(r.date)} ${r.date.slice(8)}`)]}
      rows={[
        ['kcal', ...rows.map((r) => (r.fast ? 'Fast' : formatNumber(r.kcal)))],
        ['Protein', ...rows.map((r) => (r.fast ? '—' : `${formatNumber(r.protein_g)} g`))],
        ['Session', ...rows.map((r) => r.session ?? 'Rest')],
      ]}
    />
  )
}
