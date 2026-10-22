// Owns: the training charts — weekly volume as 1d's wide stacked bars (deep plum → plum → violet → lilac, bottom to
// top, 14 px top and 6 px feet on the whole stack, up to 8 weeks the week's total in tonnes above it and no y axis, past
// that a y axis in tonnes over a hairline grid, the keys under the plot), strength per
// exercise (top-set load and Epley e1RM in the accent, the latest session haloed), and the week plan vs actuals
// (planned vs eaten kcal per weekday with the session status under it).
import { formatNumber, formatShortDate, type LegendItem } from '../../components'
import { tokens } from '../../theme'
import {
  BAR_RADIUS,
  ChartFrame,
  MARGIN,
  WEEK_BAR_MAX,
  WEEK_BAR_RADIUS,
  barCursor,
  barMotion,
  barXAxisStyle,
  gridStyle,
  niceScale,
  rechartsSize,
  surfaceText,
  tickCount,
  tickInterval,
  tintOnCard,
  tooltip,
  yAxisStyle,
  type ChartSizeProps,
} from './frame'
import { Plot } from './plot'
import { TimePanels } from './TimePanels'

interface Common extends ChartSizeProps {
  /** Draw the legend chips. Default true. */
  legend?: boolean
}

// ---------------------------------------------------------------------------------------------------------------

export interface VolumeGroup {
  key: string
  label: string
}

export interface VolumeWeek {
  /** Week label or Monday date, e.g. "2026-10-05". */
  week: string
  /** Volume (sets × reps × kg) per group key. */
  volume: Readonly<Record<string, number>>
}

export interface TrainingVolumeChartProps extends Common {
  weeks: readonly VolumeWeek[]
  /** Up to four groups, bottom → top; coloured deep plum, plum, violet, mid violet (1d's Dashboard). */
  groups: readonly VolumeGroup[]
}

/**
 * 1d's volume stack, bottom → top (the Dashboard mock: legs darkest, arms lightest): deep plum, plum, the accent violet
 * and the muscle map's mid volume step (3.30:1 on white — the top step meets the card, so it keeps the 3:1 a
 * mark needs; the mock's lilac was 1.21:1 and vanished into the card).
 */
const VOLUME_STEPS = [
  tokens.summit.plumDeep,
  tokens.summit.plum,
  tokens.summit.accent.main,
  tokens.summit.muscle.steps[2],
] as const

/** "16.4 t" from 1,000 kg up, else "820 kg". */
const tonnage = (kg: number) =>
  kg >= 1000 ? `${formatNumber(kg / 1000, kg >= 100_000 ? 0 : 1)} t` : `${formatNumber(kg)} kg`

/** The week's total written above its stack (Outfit 15). */
function TotalLabel(props: { x?: number | string; y?: number | string; value?: unknown }) {
  const v = typeof props.value === 'number' ? props.value : null
  if (v === null || v <= 0) return null
  return (
    <text
      x={Number(props.x ?? 0)}
      y={Number(props.y ?? 0) - 8}
      textAnchor="middle"
      fontFamily={tokens.font.display}
      fontSize={tokens.font.size.emphasis}
      fontWeight={tokens.font.weight.number}
      fill={tokens.ink.text}
    >
      {tonnage(v)}
    </text>
  )
}

/** Past this many weeks the totals would touch: a y axis in tonnes carries the scale instead. */
const MAX_LABELLED_WEEKS = 8

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
const weekLabel = (s: string) => (isDate(s) ? formatShortDate(s) : s)

export function TrainingVolumeChart({
  weeks,
  groups,
  width,
  height = 220,
  legend = true,
}: TrainingVolumeChartProps) {
  const series = groups.slice(0, VOLUME_STEPS.length).map((g, i) => ({ ...g, color: VOLUME_STEPS[i]! }))
  const totals = weeks.map((w) => series.reduce((s, g) => s + (w.volume[g.key] ?? 0), 0))
  const rows = weeks.map((w, i) => ({
    week: w.week,
    total: totals[i]!,
    ...Object.fromEntries(series.map((s) => [s.key, w.volume[s.key] ?? 0])),
  }))
  const labelled = rows.length <= MAX_LABELLED_WEEKS
  const peak = Math.max(1, ...totals)
  // Labelled: headroom over the tallest stack for its total (≈ 22 px of the plot). Else the axis's nice steps.
  const y = niceScale([0, peak], { zero: true, count: tickCount(height) })
  const domain: [number, number] = labelled ? [0, peak * (1 + 26 / Math.max(80, height - 30))] : y.domain
  const tonnes = peak >= 1000
  const step = (y.ticks[1] ?? peak) - (y.ticks[0] ?? 0)
  const yTick = (kg: number) => (tonnes ? formatNumber(kg / 1000, step < 1000 ? 1 : 0) : formatNumber(kg))
  const fmt = (v: number) => `${formatNumber(v)} kg`
  const Tip = tooltip<(typeof rows)[number]>(
    (r) => `Week of ${r.week}`,
    [
      { label: 'Total', color: tokens.chart.tooltip.muted, value: (r) => fmt(r.total) },
      ...[...series].reverse().map((g) => ({
        label: g.label,
        color: g.color,
        value: (r: (typeof rows)[number]) => fmt(Number((r as Record<string, unknown>)[g.key] ?? 0)),
      })),
    ],
  )
  const items: LegendItem[] = series.map((s) => ({ label: s.label, color: s.color, mark: 'bar' }))
  const label = 'Training volume per week by muscle group'
  const last = weeks.at(-1)
  const summary = last
    ? `${weeks.length} ${weeks.length === 1 ? 'week' : 'weeks'}; week of ${weekLabel(last.week)}: ${fmt(totals.at(-1)!)}` +
      (weeks.length > 1 ? `; highest week ${fmt(Math.max(...totals))}.` : '.')
    : 'No sessions yet.'
  return (
    <ChartFrame
      testId="chart-training-volume"
      label={label}
      legend={legend ? items : undefined}
      legendPlacement="bottom"
      unit={labelled ? undefined : tonnes ? 't' : 'kg'}
      width={width}
      height={height}
      empty={weeks.length === 0}
    >
      <Plot width={width} height={height}>
        {(R, plotWidth) => {
          // The stack's corners never exceed half its width: ≈ (plot ÷ weeks) × (1 − the 24 % gap), at most 120 px.
          const barWidth = Math.min(WEEK_BAR_MAX, (plotWidth / Math.max(1, rows.length)) * 0.76)
          const top = Math.min(WEEK_BAR_RADIUS.top, barWidth / 2)
          const foot = Math.min(WEEK_BAR_RADIUS.foot, barWidth / 2)
          return (
            <R.ComposedChart
              data={rows}
              margin={{ ...MARGIN, top: 4, left: 8, right: 8 }}
              barCategoryGap="24%"
              {...rechartsSize(width, height)}
              {...surfaceText(label, summary)}
            >
              {!labelled && <R.CartesianGrid {...gridStyle} />}
              <R.XAxis
                {...barXAxisStyle}
                axisLine={false}
                dataKey="week"
                tickFormatter={weekLabel}
                interval={tickInterval(rows.length, plotWidth, labelled ? 0 : yAxisStyle.width)}
                tick={{ ...barXAxisStyle.tick, fontSize: tokens.font.size.caption }}
              />
              <R.YAxis
                {...yAxisStyle}
                hide={labelled}
                domain={domain}
                ticks={labelled ? undefined : y.ticks}
                tickFormatter={yTick}
              />
              <R.Tooltip content={Tip} cursor={barCursor} />
              <R.BarStack stackId="volume" radius={[top, top, foot, foot]}>
                {series.map((s) => (
                  <R.Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    fill={s.color}
                    maxBarSize={WEEK_BAR_MAX}
                    {...barMotion(width)}
                  />
                ))}
              </R.BarStack>
              {labelled && (
                <R.Line
                  dataKey="total"
                  stroke="none"
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                  legendType="none"
                  tooltipType="none"
                  label={TotalLabel}
                />
              )}
            </R.ComposedChart>
          )
        }}
      </Plot>
    </ChartFrame>
  )
}

// ---------------------------------------------------------------------------------------------------------------

export interface StrengthSession {
  date: string
  /** Heaviest working-set load, kg. */
  load: number
  /** Reps at that load. */
  reps?: number | null
  /** Epley e1RM = load × (1 + reps / 30), kg. */
  e1rm: number
}

export interface StrengthChartProps extends Common {
  sessions: readonly StrengthSession[]
}

export function StrengthChart({ sessions, width, height = 220, legend = true }: StrengthChartProps) {
  const rows = sessions.map((s) => ({ ...s, topSet: s.load }))
  return (
    <TimePanels
      testId="chart-strength"
      label="Top-set load and estimated one-rep max per session"
      rows={rows}
      width={width}
      legend={legend}
      tickEveryPoint={false}
      panels={[
        {
          unit: 'kg',
          height,
          series: [
            {
              key: 'e1rm',
              label: 'Est. 1RM',
              color: tokens.accent.main,
              format: (v) => `${formatNumber(v, 1)} kg`,
            },
            {
              key: 'topSet',
              label: 'Top set',
              color: tintOnCard(tokens.accent.main, 0.6),
              kind: 'dots',
              format: (v) => `${formatNumber(v, 1)} kg`,
            },
          ],
        },
      ]}
    />
  )
}

// ---------------------------------------------------------------------------------------------------------------

export type SessionStatus = 'done' | 'missed' | 'planned' | 'rest'

export interface PlanDay {
  /** Weekday label, e.g. "Mon". */
  day: string
  plannedKcal?: number | null
  eatenKcal?: number | null
  session?: SessionStatus | null
  /** Fast day planned. */
  fast?: boolean
}

export interface WeekPlanVsActualChartProps extends Common {
  days: readonly PlanDay[]
}

const SESSION_TEXT: Record<SessionStatus, string> = {
  done: 'Session done',
  missed: 'Session missed',
  planned: 'Session planned',
  rest: 'Rest day',
}

/** X tick: weekday, then a session mark under it (filled = done, ring = planned, grey ring = missed). */
function DayTick(props: {
  x?: number | string
  y?: number | string
  payload?: { value?: string }
  days: readonly PlanDay[]
}) {
  const x = Number(props.x ?? 0)
  const y = Number(props.y ?? 0)
  const day = props.days.find((d) => d.day === props.payload?.value)
  const s = day?.session
  return (
    <g transform={`translate(${x},${y})`}>
      <text y={10} textAnchor="middle" fontSize={tokens.chart.axisFontSize} fill={tokens.chart.axis}>
        {props.payload?.value}
      </text>
      {s === 'done' && <circle cy={24} r={4.5} fill={tokens.metric.lean} />}
      {s === 'planned' && <circle cy={24} r={4} fill="none" stroke={tokens.metric.lean} strokeWidth={1.5} />}
      {s === 'missed' && <circle cy={24} r={4} fill="none" stroke={tokens.chart.target} strokeWidth={1.5} />}
      {day?.fast && <rect x={-4} y={20} width={8} height={8} rx={2} fill={tokens.metric.fasting} />}
    </g>
  )
}

export function WeekPlanVsActualChart({
  days,
  width,
  height = 230,
  legend = true,
}: WeekPlanVsActualChartProps) {
  const y = niceScale(
    days.flatMap((d) => [d.plannedKcal ?? 0, d.eatenKcal ?? 0]),
    { zero: true, count: tickCount(height) },
  )
  const kcal = (v: number | null | undefined) =>
    v === null || v === undefined ? null : `${formatNumber(v)} kcal`
  const planned = tintOnCard(tokens.metric.calories, 0.32)
  const Tip = tooltip<PlanDay>(
    (d) => d.day,
    [
      { label: 'Eaten', color: tokens.metric.calories, value: (d) => kcal(d.eatenKcal) },
      { label: 'Planned', color: planned, value: (d) => kcal(d.plannedKcal) },
      {
        label: 'Training',
        color: tokens.metric.lean,
        value: (d) => (d.session ? SESSION_TEXT[d.session] : null),
      },
      { label: 'Fast', color: tokens.metric.fasting, value: (d) => (d.fast ? 'Fast day' : null) },
    ],
  )
  const items: LegendItem[] = [
    { label: 'Planned kcal', color: planned, mark: 'bar' },
    { label: 'Eaten', color: tokens.metric.calories, mark: 'bar' },
    { label: 'Session done', color: tokens.metric.lean, mark: 'dot' },
    { label: 'Planned', color: tokens.metric.lean, mark: 'ring' },
    { label: 'Missed', color: tokens.chart.target, mark: 'ring' },
  ]
  if (days.some((d) => d.fast)) items.push({ label: 'Fast', color: tokens.metric.fasting, mark: 'bar' })
  const radius = BAR_RADIUS
  const label = 'Week plan versus actuals per weekday'
  const summary = days
    .map((d) =>
      [
        d.day,
        d.eatenKcal != null ? `ate ${kcal(d.eatenKcal)}` : null,
        d.plannedKcal != null ? `planned ${kcal(d.plannedKcal)}` : null,
        d.session ? SESSION_TEXT[d.session].toLowerCase() : null,
        d.fast ? 'fast day' : null,
      ]
        .filter(Boolean)
        .join(', '),
    )
    .join('; ')
  return (
    <ChartFrame
      testId="chart-week-plan"
      label={label}
      legend={legend ? items : undefined}
      unit="kcal"
      width={width}
      height={height}
      empty={days.length === 0}
    >
      <Plot width={width} height={height}>
        {(R) => (
          <R.ComposedChart
            data={days}
            margin={MARGIN}
            barCategoryGap="24%"
            barGap={2}
            {...rechartsSize(width, height)}
            {...surfaceText(label, summary)}
          >
            <R.CartesianGrid {...gridStyle} />
            <R.XAxis
              {...barXAxisStyle}
              dataKey="day"
              interval={0}
              height={44}
              tick={<DayTick days={days} />}
            />
            <R.YAxis
              {...yAxisStyle}
              domain={y.domain}
              ticks={y.ticks}
              tickFormatter={(v: number) => formatNumber(v)}
            />
            <R.Tooltip content={Tip} cursor={barCursor} />
            <R.Bar
              dataKey="plannedKcal"
              name="Planned"
              fill={planned}
              maxBarSize={16}
              radius={radius}
              {...barMotion(width)}
            />
            <R.Bar
              dataKey="eatenKcal"
              name="Eaten"
              fill={tokens.metric.calories}
              maxBarSize={16}
              radius={radius}
              {...barMotion(width)}
            />
          </R.ComposedChart>
        )}
      </Plot>
    </ChartFrame>
  )
}
