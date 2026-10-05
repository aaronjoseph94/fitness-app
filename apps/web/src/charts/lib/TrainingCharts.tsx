// Owns: the training charts — weekly volume stacked by muscle group, strength per exercise (top-set load and
// Epley e1RM), and the week plan vs actuals (planned vs eaten kcal per weekday with the session status under it).
import { Bar, BarStack, CartesianGrid, ComposedChart, Tooltip, XAxis, YAxis, BarChart } from 'recharts'
import { formatNumber, formatShortDate, type LegendItem } from '../../components'
import { tokens, withAlpha } from '../../theme'
import {
  BAR_MAX,
  ChartFrame,
  MARGIN,
  animated,
  barCursor,
  barGap,
  gridStyle,
  niceScale,
  rechartsSize,
  tooltip,
  xAxisStyle,
  yAxisStyle,
  type ChartSizeProps,
} from './frame'
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
  /** Up to four groups, bottom → top; coloured with the muscle-map indigo steps (darkest first). */
  groups: readonly VolumeGroup[]
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
const weekLabel = (s: string) => (isDate(s) ? formatShortDate(s) : s)

export function TrainingVolumeChart({
  weeks,
  groups,
  width,
  height = 220,
  legend = true,
}: TrainingVolumeChartProps) {
  const steps = [...tokens.muscleMap.steps].reverse()
  const series = groups.slice(0, steps.length).map((g, i) => ({ ...g, color: steps[i]! }))
  const rows = weeks.map((w) => ({
    week: w.week,
    ...Object.fromEntries(series.map((s) => [s.key, w.volume[s.key] ?? 0])),
  }))
  const totals = weeks.map((w) => series.reduce((s, g) => s + (w.volume[g.key] ?? 0), 0))
  const y = niceScale(totals, { zero: true })
  const fmt = (v: number) => `${formatNumber(v)} kg`
  const Tip = tooltip<(typeof rows)[number]>(
    (r) => `Week of ${r.week}`,
    [
      {
        label: 'Total',
        color: tokens.ink.text,
        value: (r) => fmt(series.reduce((s, g) => s + Number((r as Record<string, unknown>)[g.key] ?? 0), 0)),
      },
      ...[...series].reverse().map((g) => ({
        label: g.label,
        color: g.color,
        value: (r: (typeof rows)[number]) => fmt(Number((r as Record<string, unknown>)[g.key] ?? 0)),
      })),
    ],
  )
  const items: LegendItem[] = series.map((s) => ({ label: s.label, color: s.color, mark: 'bar' }))
  return (
    <ChartFrame
      testId="chart-training-volume"
      label="Training volume per week by muscle group"
      legend={legend ? items : undefined}
      unit="kg (sets × reps × load)"
      width={width}
      height={height}
      empty={weeks.length === 0}
    >
      <BarChart data={rows} margin={MARGIN} barCategoryGap="28%" {...rechartsSize(width, height)}>
        <CartesianGrid {...gridStyle} />
        <XAxis {...xAxisStyle} dataKey="week" tickFormatter={weekLabel} />
        <YAxis
          {...yAxisStyle}
          domain={y.domain}
          ticks={y.ticks}
          tickFormatter={(v: number) => formatNumber(v, 0, v > 9999)}
        />
        <Tooltip content={Tip} cursor={barCursor} />
        <BarStack stackId="volume" radius={[tokens.chart.barRadius, tokens.chart.barRadius, 0, 0]}>
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              maxBarSize={BAR_MAX}
              {...barGap}
              isAnimationActive={animated(width)}
            />
          ))}
        </BarStack>
      </BarChart>
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
              color: tokens.metric.lean,
              format: (v) => `${formatNumber(v, 1)} kg`,
            },
            {
              key: 'topSet',
              label: 'Top set',
              color: withAlpha(tokens.metric.lean, 0.5),
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
    { zero: true },
  )
  const kcal = (v: number | null | undefined) =>
    v === null || v === undefined ? null : `${formatNumber(v)} kcal`
  const planned = withAlpha(tokens.metric.calories, 0.32)
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
  const radius: [number, number, number, number] = [tokens.chart.barRadius, tokens.chart.barRadius, 0, 0]
  return (
    <ChartFrame
      testId="chart-week-plan"
      label="Week plan versus actuals per weekday"
      legend={legend ? items : undefined}
      unit="kcal"
      width={width}
      height={height}
      empty={days.length === 0}
    >
      <ComposedChart
        data={days}
        margin={MARGIN}
        barCategoryGap="24%"
        barGap={2}
        {...rechartsSize(width, height)}
      >
        <CartesianGrid {...gridStyle} />
        <XAxis {...xAxisStyle} dataKey="day" interval={0} height={44} tick={<DayTick days={days} />} />
        <YAxis
          {...yAxisStyle}
          domain={y.domain}
          ticks={y.ticks}
          tickFormatter={(v: number) => formatNumber(v)}
        />
        <Tooltip content={Tip} cursor={barCursor} />
        <Bar
          dataKey="plannedKcal"
          name="Planned"
          fill={planned}
          maxBarSize={14}
          radius={radius}
          isAnimationActive={animated(width)}
        />
        <Bar
          dataKey="eatenKcal"
          name="Eaten"
          fill={tokens.metric.calories}
          maxBarSize={14}
          radius={radius}
          isAnimationActive={animated(width)}
        />
      </ComposedChart>
    </ChartFrame>
  )
}
