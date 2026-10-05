// Owns: the hero weight chart — raw weigh-ins as faint dots, the trend line, the forecast band (±20 %) and its
// mid line to the goal, the dashed goal line, and a marker on each milestone reached.
import { formatNumber, type LegendItem } from '../../components'
import { tokens, withAlpha } from '../../theme'
import {
  ChartFrame,
  MARGIN,
  dateSpan,
  dotStyle,
  gridStyle,
  lineCursor,
  lineStyle,
  niceScale,
  rechartsSize,
  seriesSummary,
  surfaceText,
  targetStyle,
  tickInterval,
  tooltip,
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
const kg = (v: number | null | undefined) =>
  v === null || v === undefined ? null : `${formatNumber(v, 1)} kg`

export function WeightTrendChart({
  points,
  forecast = [],
  goal,
  milestones = [],
  width,
  height = 240,
  legend = true,
}: WeightTrendChartProps) {
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
  const y = niceScale(values)
  const axis = rows.length ? timeAxis(rows.map((r) => r.t)) : null
  const reached = milestones.filter((m): m is WeightMilestone & { reachedOn: string } => !!m.reachedOn)

  const items: LegendItem[] = [
    { label: 'Trend', color: C, mark: 'line' },
    { label: 'Weigh-in', color: withAlpha(C, 0.4), mark: 'dot' },
  ]
  if (forecast.length) items.push({ label: 'Forecast', color: withAlpha(C, 0.3), mark: 'band' })
  if (goal !== undefined) items.push({ label: 'Goal', color: tokens.chart.target, mark: 'dashed' })

  const Tip = tooltip<Row>(
    (r) => r.date,
    [
      { label: 'Trend', color: C, value: (r) => kg(r.trend) },
      { label: 'Weigh-in', color: withAlpha(C, 0.4), value: (r) => kg(r.raw) },
      {
        label: 'Forecast',
        color: withAlpha(C, 0.5),
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
    `Trend ${seriesSummary(points.map((p) => ({ date: p.date, value: p.trend })), (v) => kg(v)!)}`,
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
            <R.ComposedChart data={rows} margin={MARGIN} {...rechartsSize(width, height)} {...surfaceText(label, summary)}>
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
                />
              )}
              {forecast.length > 0 && (
                <R.Line
                  dataKey="mid"
                  stroke={withAlpha(C, 0.55)}
                  strokeWidth={tokens.chart.lineWidth}
                  strokeDasharray="6 5"
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
                  {...targetStyle}
                  label={{
                    value: `Goal ${formatNumber(goal, 0)} kg`,
                    position: 'insideBottomLeft',
                    fill: tokens.chart.axis,
                    fontSize: 11,
                  }}
                />
              )}
              <R.Line
                dataKey="raw"
                stroke="none"
                dot={{ r: 2.5, fill: withAlpha(C, 0.4), stroke: 'none' }}
                activeDot={{ r: 4, fill: withAlpha(C, 0.6), stroke: tokens.ink.card, strokeWidth: 2 }}
                isAnimationActive={false}
                legendType="none"
              />
              <R.Line
                dataKey="trend"
                stroke={C}
                {...lineStyle}
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
                  {...dotStyle(C, 5)}
                  ifOverflow="visible"
                  label={{
                    value: formatNumber(m.value, 0),
                    position: 'top',
                    fill: tokens.ink.text,
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                />
              ))}
            </R.ComposedChart>
          )}
        </Plot>
      )}
    </ChartFrame>
  )
}
