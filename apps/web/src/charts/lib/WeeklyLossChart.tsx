// Owns: weekly trend change against the forecast's expected change per week (1d). A week's loss is a wide bar growing
// up from the baseline — its height the kilograms lost, filled with the weight ramp (plum at the foot, coral at the
// top), 14 px top corners and 6 px feet — with the change written above it (Outfit 16, "−0.8"); a week that gained
// hangs below the baseline in the warning amber (5.1:1 on white). The expected loss is the dashed gold plan line across
// the plot. Up to 10 weeks every bar carries its value and there is no y axis (1d's clean look); past that the labels
// would touch, so a y axis of the change in kg and its hairline grid carry the scale instead. The tooltip always has
// the exact kilograms.
import { formatShortDate, formatSigned, type LegendItem } from '../../components'
import { tokens } from '../../theme'
import {
  ChartFrame,
  MARGIN,
  WEEK_BAR_MAX,
  barCursor,
  barMotion,
  barXAxisStyle,
  gridStyle,
  niceScale,
  planLine,
  rampGradient,
  rechartsSize,
  seriesSummary,
  surfaceText,
  tickCount,
  tickInterval,
  tooltip,
  useFadeId,
  wideBarPath,
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
/** Room above the tallest bar for its label, as a share of the value range. */
const LABEL_ROOM = 0.3
/** Past this many weeks the value labels would touch: the y axis carries the scale instead. */
const MAX_LABELLED = 10
const kgWeek = (v: number | null | undefined) =>
  v === null || v === undefined ? null : `${formatSigned(v, 2)} kg`

interface Row extends WeeklyLossPoint {
  /** Kilograms lost (a gain is negative): the bar's height. */
  lost: number
}

/** The wide bar: the loss ramp upward, a gain in the warning amber below the baseline (≥ 3:1 on white). */
function lossBar(fill: string) {
  return function LossBar(props: {
    x?: number
    y?: number
    width?: number
    height?: number
    payload?: unknown
  }) {
    const { x = 0, y = 0, width = 0, height = 0 } = props
    const lost = (props.payload as Row | undefined)?.lost ?? 0
    const d = wideBarPath(x, y, width, height, lost >= 0)
    return d ? <path d={d} fill={lost >= 0 ? fill : tokens.tone.warning.text} /> : <g />
  }
}

/** The change written just past the data end of its bar: above a loss, below a gain. */
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
  // `value` is the change (negative = loss), so a loss's label sits above its upward bar.
  return (
    <text
      x={x}
      y={v <= 0 ? top - 8 : bottom + 18}
      textAnchor="middle"
      fontFamily={tokens.font.display}
      fontSize={tokens.font.size.itemTitle}
      fontWeight={tokens.font.weight.number}
      fill={tokens.ink.text}
    >
      {formatSigned(v, 1)}
    </text>
  )
}

export function WeeklyLossChart({ weeks, width, height = 200, legend = true }: WeeklyLossChartProps) {
  const fillId = useFadeId('loss-ramp')
  const rows: Row[] = weeks.map((w) => ({ ...w, lost: -w.change }))
  const lost = rows.map((r) => r.lost)
  const expectedLoss = weeks
    .map((w) => (typeof w.expected === 'number' && Number.isFinite(w.expected) ? -w.expected : null))
    .filter((v): v is number => v !== null)
  // The forecast's rate is usually the same every week: one dashed line (1d), else a dashed step per week.
  const steady =
    expectedLoss.length > 0 && Math.max(...expectedLoss) - Math.min(...expectedLoss) < 0.005
      ? expectedLoss[0]!
      : null
  const labelled = rows.length <= MAX_LABELLED
  const top = Math.max(0, ...lost, ...expectedLoss)
  const bottom = Math.min(0, ...lost)
  const span = Math.max(0.1, top - bottom)
  // Labelled bars need room past their ends for the value; an axis needs only its own nice steps.
  const room = labelled ? span * LABEL_ROOM : 0
  const y = niceScale([bottom - (bottom < 0 ? room : 0), top + room], {
    zero: true,
    count: labelled ? 2 : tickCount(height),
    minStep: 0.1,
  })
  const Tip = tooltip<Row>(
    (w) => `Week of ${w.week}`,
    [
      { label: 'Trend change', color: C, value: (w) => kgWeek(w.change) },
      { label: 'Expected', color: tokens.chart.plan, dashed: true, value: (w) => kgWeek(w.expected) },
    ],
  )
  const items: LegendItem[] = [
    { label: 'Trend change', color: C, mark: 'bar' },
    { label: 'Expected', color: tokens.chart.plan, mark: 'dashed' },
  ]
  const label = 'Weekly trend change versus expected'
  const summary = `Weeks of ${seriesSummary(
    weeks.map((w) => ({ date: w.week, value: w.change })),
    (v) => `${formatSigned(v, 2)} kg`,
  )}${steady !== null ? ` Expected ${formatSigned(-steady, 2)} kg a week.` : ''}`
  return (
    <ChartFrame
      testId="chart-weekly-loss"
      label={label}
      legend={legend ? items : undefined}
      legendPlacement="bottom"
      unit={labelled ? undefined : 'kg'}
      width={width}
      height={height}
      empty={weeks.length === 0}
    >
      <Plot width={width} height={height}>
        {(R, plotWidth) => (
          <R.ComposedChart
            data={rows}
            margin={{ ...MARGIN, top: 4, left: 8, right: 8 }}
            barCategoryGap="22%"
            {...rechartsSize(width, height)}
            {...surfaceText(label, summary)}
          >
            <defs>{rampGradient(fillId, 'weight')}</defs>
            {!labelled && <R.CartesianGrid {...gridStyle} />}
            <R.XAxis
              {...barXAxisStyle}
              axisLine={false}
              dataKey="week"
              tickFormatter={(d: string) => formatShortDate(d)}
              interval={tickInterval(rows.length, plotWidth, labelled ? 0 : yAxisStyle.width)}
              tick={{ ...barXAxisStyle.tick, fontSize: tokens.font.size.caption }}
            />
            {/* The scale is the change, as the labels write it: a loss (plotted up) reads "−0.5". */}
            <R.YAxis
              {...yAxisStyle}
              hide={labelled}
              domain={y.domain}
              ticks={y.ticks}
              tickFormatter={(v: number) => formatSigned(-v, 1)}
            />
            <R.Tooltip content={Tip} cursor={barCursor} />
            {bottom < 0 && <R.ReferenceLine y={0} stroke={tokens.chart.baseline} strokeWidth={1} />}
            <R.Bar
              dataKey="lost"
              fill={`url(#${fillId})`}
              maxBarSize={WEEK_BAR_MAX}
              shape={lossBar(`url(#${fillId})`)}
              {...barMotion(width)}
            >
              {labelled && <R.LabelList dataKey="change" content={EndLabel} />}
            </R.Bar>
            {steady !== null ? (
              <R.ReferenceLine y={steady} {...planLine} ifOverflow="extendDomain" />
            ) : (
              <R.Line
                dataKey={(r: Row) => (typeof r.expected === 'number' ? -r.expected : null)}
                {...planLine}
                dot={false}
                activeDot={false}
                type="step"
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
