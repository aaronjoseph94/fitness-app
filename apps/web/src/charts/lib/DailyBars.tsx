// Owns: the one implementation behind every "bars per day + target" chart (calories, macros, water, steps), in the
// 2a style: a day axis over the baseline rule (day-of-month labels for up to 16 days, "Oct 12" beyond), single
// or flush-stacked bars with radius-3 tops that grow on screen, a dashed target line (optionally in its series'
// colour), days below the target in the series' tint when asked, an optional overlay line (e.g. a rolling median)
// and optional baseline markers (e.g. fast days). Charts configure it; they do not re-implement it.
import { formatNumber, type LegendItem } from '../../components'
import { tokens } from '../../theme'
import {
  BAR_MAX,
  BAR_RADIUS,
  ChartFrame,
  DAY_LABEL_PX,
  DAY_NUMBER_MAX,
  MARGIN,
  barCursor,
  barMotion,
  barXAxisStyle,
  dataEndBarPath,
  dayTick,
  dotStyle,
  gridStyle,
  lineStyle,
  niceScale,
  rechartsSize,
  seriesSummary,
  surfaceText,
  targetLine,
  tickCount,
  tickInterval,
  tooltip,
  yAxisStyle,
  type TipLine,
  type DayRow,
  field,
  num,
} from './frame'
import { Plot } from './plot'
import type { RechartsModule } from '../preload'

export interface DaySeries {
  key: string
  label: string
  color: string
  /** A single series with a target: days below it are drawn in this tint (2a: on-target days in full colour). */
  missColor?: string
}

export interface DailyBarsProps {
  testId: string
  label: string
  unit: string
  rows: readonly DayRow[]
  /** Stacked bottom → top when more than one. */
  bars: readonly DaySeries[]
  /** Dashed line; `color` when it belongs to one series (default the grey target colour). */
  target?: { value: number; label: string; color?: string }
  line?: DaySeries
  /** Rows where `marker.key` is true get a dot on the baseline (e.g. fast days). */
  marker?: DaySeries
  /** Tooltip value text, e.g. v => `${formatNumber(v)} kcal`. */
  format: (v: number) => string
  /** Y tick text. Default: grouped numbers, every tick compact ("15K") once the axis passes 9,999. */
  tickFormat?: (v: number) => string
  width?: number
  height: number
  legend: boolean
}

const val = (r: DayRow, key: string) => num(field(r, key))

export function DailyBars({
  testId,
  label,
  unit,
  rows,
  bars,
  target,
  line,
  marker,
  format,
  tickFormat,
  width,
  height,
  legend,
}: DailyBarsProps) {
  const stacked = bars.length > 1
  const single = bars[0]
  const tint = !stacked && target && single?.missColor ? single.missColor : null
  const data = rows.map((r) => {
    const v = single ? val(r, single.key) : null
    return {
      ...r,
      __marker: marker && field(r, marker.key) === true ? 0 : null,
      __miss: tint !== null && v !== null && v < target!.value,
    }
  })
  const totals = data.map((r) => bars.reduce((s, b) => s + (val(r, b.key) ?? 0), 0))
  const lineVals = line ? data.map((r) => val(r, line.key)).filter((v): v is number => v !== null) : []
  const y = niceScale([...totals, ...lineVals, ...(target ? [target.value] : [])], {
    zero: true,
    count: tickCount(height),
  })
  const compact = Math.max(Math.abs(y.domain[0]), Math.abs(y.domain[1])) > 9999
  const decimals = compact && y.ticks.some((t) => t % 1000 !== 0) ? 1 : 0
  const ticks = tickFormat ?? ((v: number) => formatNumber(v, decimals, compact))

  const targetColor = target?.color ?? tokens.chart.target
  const items: LegendItem[] = bars.map((b) => ({ label: b.label, color: b.color, mark: 'bar' as const }))
  if (tint && data.some((r) => r.__miss)) items.push({ label: 'Below target', color: tint, mark: 'bar' })
  if (line) items.push({ label: line.label, color: line.color, mark: 'line' })
  if (target) items.push({ label: target.label, color: targetColor, mark: 'dashed' })
  if (marker && data.some((r) => r.__marker === 0))
    items.push({ label: marker.label, color: marker.color, mark: 'dot' })

  const tipLines: TipLine<DayRow>[] = [
    ...(stacked
      ? [
          {
            label: 'Total',
            color: tokens.ink.text,
            value: (r: DayRow) => format(bars.reduce((s, b) => s + (val(r, b.key) ?? 0), 0)),
          },
        ]
      : []),
    ...[...bars].reverse().map((b) => ({
      label: b.label,
      color: b.color,
      // In a stack, an empty segment (e.g. no snack that day) is noise; a single series shows its 0.
      value: (r: DayRow) => {
        const v = val(r, b.key)
        return v === null || (stacked && v === 0) ? null : format(v)
      },
    })),
    ...(line
      ? [
          {
            label: line.label,
            color: line.color,
            value: (r: DayRow) => (val(r, line.key) === null ? null : format(val(r, line.key)!)),
          },
        ]
      : []),
    ...(target
      ? [{ label: target.label, color: targetColor, dashed: true, value: () => format(target.value) }]
      : []),
    ...(marker
      ? [
          {
            label: marker.label,
            color: marker.color,
            value: (r: DayRow) => (field(r, marker.key) === true ? 'Yes' : null),
          },
        ]
      : []),
  ]
  const Tip = tooltip<DayRow>((r) => r.date, tipLines)
  const motion = barMotion(width)
  const tickText = dayTick(data.length)
  const labelPx = data.length <= DAY_NUMBER_MAX ? DAY_LABEL_PX : undefined
  // Per-day total (a day with no value in any bar is a gap, not a zero), then the target.
  const summary = [
    seriesSummary(
      data.map((r) => ({
        date: r.date,
        value: bars.every((b) => val(r, b.key) === null)
          ? null
          : bars.reduce((s, b) => s + (val(r, b.key) ?? 0), 0),
      })),
      format,
    ),
    target ? `${target.label} ${format(target.value)}.` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const barEls = (R: RechartsModule) =>
    bars.map((b) =>
      stacked ? (
        <R.Bar key={b.key} dataKey={b.key} name={b.label} fill={b.color} maxBarSize={BAR_MAX} {...motion} />
      ) : (
        <R.Bar
          key={b.key}
          dataKey={b.key}
          name={b.label}
          fill={b.color}
          maxBarSize={BAR_MAX}
          radius={BAR_RADIUS}
          shape={tint ? tintedBar(tint) : undefined}
          {...motion}
        />
      ),
    )

  return (
    <ChartFrame
      testId={testId}
      label={label}
      legend={legend ? items : undefined}
      unit={unit}
      width={width}
      height={height}
      empty={rows.length === 0}
    >
      <Plot width={width} height={height}>
        {(R, plotWidth) => (
          <R.ComposedChart
            data={data}
            margin={MARGIN}
            barCategoryGap="16%"
            {...rechartsSize(width, height)}
            {...surfaceText(label, summary)}
          >
            <R.CartesianGrid {...gridStyle} />
            <R.XAxis
              {...barXAxisStyle}
              dataKey="date"
              tickFormatter={tickText}
              interval={tickInterval(data.length, plotWidth, undefined, labelPx)}
            />
            <R.YAxis {...yAxisStyle} domain={y.domain} ticks={y.ticks} tickFormatter={ticks} />
            <R.Tooltip content={Tip} cursor={barCursor} />
            {stacked ? (
              <R.BarStack stackId="day" radius={BAR_RADIUS}>
                {barEls(R)}
              </R.BarStack>
            ) : (
              barEls(R)
            )}
            {target && <R.ReferenceLine y={target.value} {...targetLine(targetColor)} />}
            {line && (
              <R.Line
                dataKey={line.key}
                name={line.label}
                stroke={line.color}
                {...lineStyle}
                dot={false}
                activeDot={dotStyle(line.color)}
                connectNulls
                isAnimationActive={false}
              />
            )}
            {marker && (
              <R.Line
                dataKey="__marker"
                stroke="none"
                dot={dotStyle(marker.color, 4)}
                activeDot={false}
                isAnimationActive={false}
                legendType="none"
              />
            )}
          </R.ComposedChart>
        )}
      </Plot>
    </ChartFrame>
  )
}

interface BarShapeLike {
  x?: number
  y?: number
  width?: number
  height?: number
  fill?: string
  payload?: unknown
}

/** A day bar in full colour on target and in `missColor` below it (rounded data end, square baseline). */
function tintedBar(missColor: string) {
  return function TintedBar(p: BarShapeLike) {
    const miss = (p.payload as { __miss?: boolean } | undefined)?.__miss === true
    const d = dataEndBarPath(p.x ?? 0, p.y ?? 0, p.width ?? 0, p.height ?? 0, true)
    return d ? <path d={d} fill={miss ? missColor : p.fill} /> : <g />
  }
}
