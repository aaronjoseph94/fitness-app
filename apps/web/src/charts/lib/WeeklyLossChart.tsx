// Owns: weekly trend change as bars about zero (a loss hangs below the line) against the forecast's expected
// change per week (dashed grey markers joined by a dashed line).
import { formatShortDate, formatSigned, type LegendItem } from '../../components'
import { tokens } from '../../theme'
import {
  BAR_MAX,
  ChartFrame,
  MARGIN,
  animated,
  barCursor,
  tickInterval,
  dataEndBarPath,
  gridStyle,
  niceScale,
  rechartsSize,
  seriesSummary,
  surfaceText,
  tooltip,
  xAxisStyle,
  yAxisStyle,
  type ChartSizeProps,
} from './frame'
import { Plot } from './plot'

export interface WeeklyLossPoint {
  /** Monday of the week, "2026-10-05". */
  week: string
  /** Trend change over the week, kg (negative = loss). */
  change: number
  /** Expected change from the forecast, kg (negative = loss). */
  expected?: number | null
}

export interface WeeklyLossChartProps extends ChartSizeProps {
  weeks: readonly WeeklyLossPoint[]
  legend?: boolean
}

const C = tokens.metric.weight
const kgWeek = (v: number | null | undefined) =>
  v === null || v === undefined ? null : `${formatSigned(v, 2)} kg`

/** Bar shape with the data end rounded, whichever side of zero it falls. */
function LossBar(props: {
  x?: number
  y?: number
  width?: number
  height?: number
  value?: number | [number, number]
  fill?: string
}) {
  const { x = 0, y = 0, width = 0, height = 0, fill } = props
  const v = Array.isArray(props.value) ? props.value[1] - props.value[0] : (props.value ?? 0)
  const d = dataEndBarPath(x, y, width, height, v >= 0)
  return d ? <path d={d} fill={fill} /> : null
}

export function WeeklyLossChart({ weeks, width, height = 200, legend = true }: WeeklyLossChartProps) {
  const y = niceScale(
    weeks.flatMap((w) => [w.change, w.expected ?? 0]),
    { zero: true, count: 4 },
  )
  const Tip = tooltip<WeeklyLossPoint>(
    (w) => `Week of ${w.week}`,
    [
      { label: 'Trend change', color: C, value: (w) => kgWeek(w.change) },
      { label: 'Expected', color: tokens.chart.target, dashed: true, value: (w) => kgWeek(w.expected) },
    ],
  )
  const items: LegendItem[] = [
    { label: 'Trend change', color: C, mark: 'bar' },
    { label: 'Expected', color: tokens.chart.target, mark: 'dashed' },
  ]
  const label = 'Weekly trend change versus expected'
  const summary = `Weeks of ${seriesSummary(weeks.map((w) => ({ date: w.week, value: w.change })), (v) => `${formatSigned(v, 2)} kg`)}`
  return (
    <ChartFrame
      testId="chart-weekly-loss"
      label={label}
      legend={legend ? items : undefined}
      unit="kg / week"
      width={width}
      height={height}
      empty={weeks.length === 0}
    >
      <Plot width={width} height={height}>
        {(R, plotWidth) => (
          <R.ComposedChart
            data={weeks}
            margin={MARGIN}
            barCategoryGap="30%"
            {...rechartsSize(width, height)}
            {...surfaceText(label, summary)}
          >
            <R.CartesianGrid {...gridStyle} />
            <R.XAxis
              {...xAxisStyle}
              dataKey="week"
              tickFormatter={(d: string) => formatShortDate(d)}
              interval={tickInterval(weeks.length, plotWidth)}
            />
            <R.YAxis
              {...yAxisStyle}
              domain={y.domain}
              ticks={y.ticks}
              tickFormatter={(v: number) => v.toFixed(1)}
            />
            <R.Tooltip content={Tip} cursor={barCursor} />
            <R.ReferenceLine y={0} stroke={tokens.ink.border} strokeWidth={1} />
            <R.Bar
              dataKey="change"
              fill={C}
              maxBarSize={BAR_MAX}
              shape={LossBar}
              isAnimationActive={animated(width)}
            />
            <R.Line
              dataKey="expected"
              stroke={tokens.chart.target}
              strokeWidth={1.5}
              strokeDasharray={tokens.chart.targetDash}
              dot={{ r: 3, fill: tokens.chart.target, stroke: tokens.ink.card, strokeWidth: 1.5 }}
              activeDot={false}
              type="linear"
              connectNulls
              isAnimationActive={false}
            />
          </R.ComposedChart>
        )}
      </Plot>
    </ChartFrame>
  )
}
