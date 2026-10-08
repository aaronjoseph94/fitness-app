// Owns: the hero weight chart (2a) — the 2.5 px trend line over an area fading from 18 % to 0, raw weigh-ins as 8 px
// white dots with a grey ring, the latest trend point ringed in the accent, the forecast (dashed "5 5" mid line over
// the light ±20 % band) to the goal, the goal line in the goal colour with a dot where the forecast meets it, and a
// marker on each milestone reached.
import { formatNumber, type LegendItem } from '../../components'
import { tokens } from '../../theme'
import {
  ChartFrame,
  FORECAST_WIDTH,
  MARGIN,
  TREND_WIDTH,
  currentPoint,
  dateSpan,
  dotStyle,
  fadeDefs,
  gridStyle,
  lineCursor,
  lineStyle,
  niceScale,
  rechartsSize,
  ringDot,
  seriesSummary,
  surfaceText,
  tickCount,
  tickInterval,
  tooltip,
  useFadeId,
  xAxisStyle,
  yAxisStyle,
  type ChartSizeProps,
} from './frame'
import { Plot } from './plot'
import { dateToTime, timeAxis } from './time'

export interface WeightPoint {
  date: string
  /** Scale weight that morning, kg. */
  raw?: number | null
  /** Trend weight (EWMA), kg. */
  trend?: number | null
}

export interface ForecastPoint {
  date: string
  mid: number
  low: number
  high: number
}

export interface WeightMilestone {
  value: number
  /** Local date the trend first reached it; unreached milestones get no marker. */
  reachedOn?: string | null
}

export interface WeightTrendChartProps extends ChartSizeProps {
  points: readonly WeightPoint[]
  /** Start it at the last trend point so band and trend meet. */
  forecast?: readonly ForecastPoint[]
  /** Goal weight, kg (dashed line). */
  goal?: number
  milestones?: readonly WeightMilestone[]
  /** Draw the legend chips. Default true. */
  legend?: boolean
}

interface Row {
  t: number
  date: string
  raw?: number | null
  trend?: number | null
  mid?: number
  band?: [number, number]
}

const C = tokens.metric.weight
const GOAL = tokens.chart.goal
const kg = (v: number | null | undefined) =>
  v === null || v === undefined ? null : `${formatNumber(v, 1)} kg`
/** The trend must span this share of the x-axis for the area fade to be drawn under it. */
const MIN_FADE_SHARE = 0.3
/** Below this many px between weigh-ins the dots shrink, so a long window reads as a band, not a smear. */
const DOT_SPACING_PX = 10

export function WeightTrendChart({
  points,
  forecast = [],
  goal,
  milestones = [],
  width,
  height = 240,
  legend = true,
}: WeightTrendChartProps) {
  const fadeId = useFadeId('weight-fade')
  const byDate = new Map<string, Row>()
  for (const p of points)
    byDate.set(p.date, { t: dateToTime(p.date), date: p.date, raw: p.raw, trend: p.trend })
  for (const f of forecast) {
    const row = byDate.get(f.date) ?? { t: dateToTime(f.date), date: f.date }
    row.mid = f.mid
    row.band = [f.low, f.high]
    byDate.set(f.date, row)
  }
  const rows = [...byDate.values()].sort((a, b) => a.t - b.t)
  const values = rows
    .flatMap((r) => [r.raw, r.trend, r.band?.[0], r.band?.[1]])
    .filter((v): v is number => v != null)
  if (goal !== undefined) values.push(goal)
  const y = niceScale(values, { count: tickCount(height) })
  const axis = rows.length ? timeAxis(rows.map((r) => r.t)) : null
  const reached = milestones.filter((m): m is WeightMilestone & { reachedOn: string } => !!m.reachedOn)
  // The current point: the last day with a trend value.
  const latest = [...rows].reverse().find((r) => r.trend != null)
  // The forecast ends on the goal date: mark where it meets the goal line.
  const end = forecast.at(-1)
  const meetsGoal = goal !== undefined && end !== undefined && Math.abs(end.mid - goal) < 0.05
  const rawCount = rows.filter((r) => r.raw != null).length
  // The fade under the trend belongs to a window of weigh-ins (2a Today/Progress). When a long forecast dominates the
  // axis (the journey view) it would be a tall sliver at the left edge, so it is left out.
  const trendRows = rows.filter((r) => r.trend != null)
  const trendShare =
    axis && trendRows.length > 1
      ? (trendRows.at(-1)!.t - trendRows[0]!.t) / Math.max(1, axis.domain[1] - axis.domain[0])
      : 0
  const fade = trendShare >= MIN_FADE_SHARE

  const items: LegendItem[] = [
    { label: 'Trend', color: C, mark: 'line' },
    { label: 'Weigh-in', color: tokens.chart.dotRing, mark: 'ring' },
  ]
  if (forecast.length) items.push({ label: 'Forecast', color: C, mark: 'dashed' })
  if (goal !== undefined) items.push({ label: 'Goal', color: GOAL, mark: 'line' })

  const Tip = tooltip<Row>(
    (r) => r.date,
    [
      { label: 'Trend', color: C, value: (r) => kg(r.trend) },
      { label: 'Weigh-in', color: tokens.chart.dotRing, value: (r) => kg(r.raw) },
      {
        label: 'Forecast',
        color: C,
        dashed: true,
        value: (r) =>
          r.mid === undefined || r.trend != null
            ? null
            : `${kg(r.mid)} (${formatNumber(r.band![0], 1)}–${formatNumber(r.band![1], 1)})`,
      },
    ],
  )

  const label = 'Weight trend with forecast'
  const summary = [
    `Trend ${seriesSummary(
      points.map((p) => ({ date: p.date, value: p.trend })),
      (v) => kg(v)!,
    )}`,
    forecast.length ? `Forecast ${kg(forecast.at(-1)!.mid)} by ${dateSpan([forecast.at(-1)!.date])}.` : '',
    goal !== undefined ? `Goal ${kg(goal)}.` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <ChartFrame
      testId="chart-weight-trend"
      label={label}
      legend={legend ? items : undefined}
      unit="kg"
      width={width}
      height={height}
      empty={rows.length === 0}
    >
      {axis && (
        <Plot width={width} height={height}>
          {(R, plotWidth) => (
            <R.ComposedChart
              data={rows}
              margin={MARGIN}
              {...rechartsSize(width, height)}
              {...surfaceText(label, summary)}
            >
              {fade && fadeDefs(fadeId, C)}
              <R.CartesianGrid {...gridStyle} />
              <R.XAxis
                {...xAxisStyle}
                dataKey="t"
                type="number"
                scale="time"
                domain={axis.domain}
                ticks={axis.ticks}
                tickFormatter={axis.format}
                interval={tickInterval(axis.ticks.length, plotWidth)}
              />
              <R.YAxis {...yAxisStyle} domain={y.domain} ticks={y.ticks} />
              <R.Tooltip content={Tip} cursor={lineCursor} />
              {forecast.length > 0 && (
                <R.Area
                  dataKey="band"
                  stroke="none"
                  fill={C}
                  fillOpacity={tokens.chart.bandOpacity}
                  connectNulls
                  isAnimationActive={false}
                  activeDot={false}
                  legendType="none"
                />
              )}
              {fade && (
                <R.Area
                  dataKey="trend"
                  stroke="none"
                  fill={`url(#${fadeId})`}
                  isAnimationActive={false}
                  activeDot={false}
                  legendType="none"
                  tooltipType="none"
                />
              )}
              {forecast.length > 0 && (
                <R.Line
                  dataKey="mid"
                  stroke={C}
                  strokeWidth={FORECAST_WIDTH}
                  strokeDasharray={tokens.chart.forecastDash}
                  dot={false}
                  activeDot={false}
                  connectNulls
                  type="monotone"
                  isAnimationActive={false}
                />
              )}
              {goal !== undefined && (
                <R.ReferenceLine
                  y={goal}
                  stroke={GOAL}
                  strokeWidth={1.5}
                  ifOverflow="extendDomain"
                  label={{
                    value: `Goal ${formatNumber(goal, 0)} kg`,
                    position: 'insideBottomLeft',
                    fill: GOAL,
                    fontSize: tokens.chart.axisFontSize,
                    fontWeight: tokens.font.weight.label,
                  }}
                />
              )}
              <R.Line
                dataKey="raw"
                stroke="none"
                dot={ringDot(
                  tokens.chart.dotRing,
                  rawCount > 1 && (plotWidth - yAxisStyle.width) / rawCount < DOT_SPACING_PX,
                )}
                activeDot={{ r: 4, fill: tokens.ink.card, stroke: tokens.ink.text, strokeWidth: 1.5 }}
                isAnimationActive={false}
                legendType="none"
              />
              <R.Line
                dataKey="trend"
                stroke={C}
                {...lineStyle}
                strokeWidth={TREND_WIDTH}
                dot={false}
                activeDot={dotStyle(C)}
                connectNulls
                isAnimationActive={false}
              />
              {reached.map((m) => (
                <R.ReferenceDot
                  key={m.value}
                  x={dateToTime(m.reachedOn)}
                  y={m.value}
                  {...dotStyle(C, 4)}
                  ifOverflow="visible"
                  label={{
                    value: formatNumber(m.value, 0),
                    position: 'top',
                    fill: tokens.ink.text,
                    fontSize: tokens.chart.axisFontSize,
                    fontWeight: tokens.font.weight.heading,
                  }}
                />
              ))}
              {meetsGoal && (
                <R.ReferenceDot
                  x={dateToTime(end.date)}
                  y={goal}
                  r={5}
                  fill={GOAL}
                  stroke={tokens.ink.card}
                  strokeWidth={2}
                  ifOverflow="visible"
                />
              )}
              {latest && (
                <R.ReferenceDot x={latest.t} y={latest.trend!} ifOverflow="visible" shape={currentPoint(C)} />
              )}
            </R.ComposedChart>
          )}
        </Plot>
      )}
    </ChartFrame>
  )
}
