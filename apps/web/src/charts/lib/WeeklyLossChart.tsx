// Owns: weekly trend change as bars about zero (a loss hangs below the line) against the forecast's expected
// change per week (a 1 px dashed grey line with small markers). 2a: wide accent bars with the data end rounded, the
// change written at the end of each bar (12/600), the zero line as the baseline.
import { formatShortDate, formatSigned, type LegendItem } from '../../components'
import { tokens } from '../../theme'
import {
  ChartFrame,
  MARGIN,
  WEEK_BAR_MAX,
  barCursor,
  barMotion,
  tickCount,
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
/** Room past the lowest/highest bar for its label, as a share of the value range. */
const LABEL_ROOM = 0.18
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
  const d = dataEndBarPath(x, y, width, height, v >= 0, BAR_END_RADIUS)
  return d ? <path d={d} fill={fill} /> : null
}

/** 2a rounds the end of these wide bars a little more than a day bar. */
const BAR_END_RADIUS = 4

/** The change written just past the data end of its bar: above a gain, below a loss. */
function EndLabel(props: {
  x?: number | string
  y?: number | string
  width?: number | string
  height?: number | string
  value?: unknown
}) {
  const v = typeof props.value === 'number' ? props.value : null
  if (v === null) return null
  const x = Number(props.x ?? 0) + Number(props.width ?? 0) / 2
  const y = Number(props.y ?? 0)
  const h = Number(props.height ?? 0)
  const top = Math.min(y, y + h)
  const bottom = Math.max(y, y + h)
  return (
    <text
      x={x}
      y={v < 0 ? bottom + 14 : top - 6}
      textAnchor="middle"
      fontSize={tokens.font.size.caption}
      fontWeight={tokens.font.weight.heading}
      fill={tokens.ink.text}
    >
      {formatSigned(v, 1)}
    </text>
  )
}

export function WeeklyLossChart({ weeks, width, height = 200, legend = true }: WeeklyLossChartProps) {
  // Ticks print one decimal, so every step is a multiple of 0.1 (a 0.25 step would print −0.75 as "−0.8").
  const values = weeks.flatMap((w) => [w.change, w.expected ?? 0])
  const span = Math.max(0.1, Math.max(0, ...values) - Math.min(0, ...values))
  const y = niceScale(
    [
      ...values,
      Math.min(0, ...values) - (Math.min(...values) < 0 ? span * LABEL_ROOM : 0),
      Math.max(0, ...values) + (Math.max(...values) > 0 ? span * LABEL_ROOM : 0),
    ],
    { zero: true, count: tickCount(height), minStep: 0.1 },
  )
  const Tip = tooltip<WeeklyLossPoint>(
    (w) => `Week of ${w.week}`,
    [
      { label: 'Trend change', color: C, value: (w) => kgWeek(w.change) },
      { label: 'Expected', color: tokens.chart.target, dashed: true, value: (w) => kgWeek(w.expected) },
    ],
  )
  // The forecast's rate is usually the same every week: then it is one dashed line labelled at the right (2a), not a
  // line through a marker per week.
  const expected = weeks
    .map((w) => w.expected)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  const steady =
    expected.length > 0 && Math.max(...expected) - Math.min(...expected) < 0.005 ? expected[0]! : null
  const items: LegendItem[] = [
    { label: 'Trend change', color: C, mark: 'bar' },
    { label: 'Expected', color: tokens.chart.target, mark: 'dashed' },
  ]
  const label = 'Weekly trend change versus expected'
  const summary = `Weeks of ${seriesSummary(
    weeks.map((w) => ({ date: w.week, value: w.change })),
    (v) => `${formatSigned(v, 2)} kg`,
  )}`
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
            barCategoryGap="24%"
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
              tickFormatter={(v: number) => (v === 0 ? '0' : formatSigned(v, 1))}
            />
            <R.Tooltip content={Tip} cursor={barCursor} />
            <R.ReferenceLine y={0} stroke={tokens.chart.baseline} strokeWidth={1} />
            <R.Bar dataKey="change" fill={C} maxBarSize={WEEK_BAR_MAX} shape={LossBar} {...barMotion(width)}>
              <R.LabelList dataKey="change" content={EndLabel} />
            </R.Bar>
            {steady !== null ? (
              <R.ReferenceLine
                y={steady}
                stroke={tokens.chart.target}
                strokeWidth={1}
                strokeDasharray={tokens.chart.targetDash}
                ifOverflow="extendDomain"
                label={{
                  value: formatSigned(steady, 2),
                  position: 'insideBottomRight',
                  fill: tokens.chart.axis,
                  fontSize: tokens.chart.axisFontSize,
                }}
              />
            ) : (
              <R.Line
                dataKey="expected"
                stroke={tokens.chart.target}
                strokeWidth={1}
                strokeDasharray={tokens.chart.targetDash}
                dot={{ r: 2.5, fill: tokens.chart.target, stroke: tokens.ink.card, strokeWidth: 1 }}
                activeDot={false}
                type="linear"
                connectNulls
                isAnimationActive={false}
              />
            )}
          </R.ComposedChart>
        )}
      </Plot>
    </ChartFrame>
  )
}
