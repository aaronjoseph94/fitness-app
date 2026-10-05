// Owns: the one implementation behind every "bars per day + target" chart (calories, macros, water, steps):
// date axis, stacked or single bars with 4 px rounded tops and 2 px surface gaps, a dashed target line, an optional
// overlay line (e.g. a rolling median) and optional baseline markers (e.g. fast days). Charts configure it; they
// do not re-implement it.
import { formatNumber, formatShortDate, type LegendItem } from '../../components'
import { tokens } from '../../theme'
import {
  BAR_MAX,
  ChartFrame,
  MARGIN,
  animated,
  barCursor,
  barGap,
  tickInterval,
  dotStyle,
  gridStyle,
  lineStyle,
  niceScale,
  rechartsSize,
  seriesSummary,
  surfaceText,
  targetStyle,
  tooltip,
  xAxisStyle,
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
}

export interface DailyBarsProps {
  testId: string
  label: string
  unit: string
  rows: readonly DayRow[]
  /** Stacked bottom → top when more than one. */
  bars: readonly DaySeries[]
  target?: { value: number; label: string }
  line?: DaySeries
  /** Rows where `marker.key` is true get a dot on the baseline (e.g. fast days). */
  marker?: DaySeries
  /** Tooltip value text, e.g. v => `${formatNumber(v)} kcal`. */
  format: (v: number) => string
  /** Y tick text. Default: grouped number, compact above 9,999. */
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
  const data = rows.map((r) => ({ ...r, __marker: marker && field(r, marker.key) === true ? 0 : null }))
  const totals = data.map((r) => bars.reduce((s, b) => s + (val(r, b.key) ?? 0), 0))
  const lineVals = line ? data.map((r) => val(r, line.key)).filter((v): v is number => v !== null) : []
  const y = niceScale([...totals, ...lineVals, ...(target ? [target.value] : [])], { zero: true })
  const ticks = tickFormat ?? ((v: number) => formatNumber(v, 0, Math.abs(v) > 9999))

  const items: LegendItem[] = bars.map((b) => ({ label: b.label, color: b.color, mark: 'bar' as const }))
  if (line) items.push({ label: line.label, color: line.color, mark: 'line' })
  if (target) items.push({ label: target.label, color: tokens.chart.target, mark: 'dashed' })
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
      ? [{ label: target.label, color: tokens.chart.target, dashed: true, value: () => format(target.value) }]
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
  const anim = animated(width)
  // Per-day total (a day with no value in any bar is a gap, not a zero), then the target.
  const summary = [
    seriesSummary(
      data.map((r) => ({ date: r.date, value: bars.every((b) => val(r, b.key) === null) ? null : bars.reduce((s, b) => s + (val(r, b.key) ?? 0), 0) })),
      format,
    ),
    target ? `${target.label} ${format(target.value)}.` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const barEls = (R: RechartsModule) =>
    bars.map((b) =>
      stacked ? (
        <R.Bar
          key={b.key}
          dataKey={b.key}
          name={b.label}
          fill={b.color}
          maxBarSize={BAR_MAX}
          {...barGap}
          isAnimationActive={anim}
        />
      ) : (
        <R.Bar
          key={b.key}
          dataKey={b.key}
          name={b.label}
          fill={b.color}
          maxBarSize={BAR_MAX}
          radius={[tokens.chart.barRadius, tokens.chart.barRadius, 0, 0]}
          isAnimationActive={anim}
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
            barCategoryGap="22%"
            {...rechartsSize(width, height)}
            {...surfaceText(label, summary)}
          >
            <R.CartesianGrid {...gridStyle} />
            <R.XAxis
              {...xAxisStyle}
              dataKey="date"
              tickFormatter={(d: string) => formatShortDate(d)}
              interval={tickInterval(data.length, plotWidth)}
            />
            <R.YAxis {...yAxisStyle} domain={y.domain} ticks={y.ticks} tickFormatter={ticks} />
            <R.Tooltip content={Tip} cursor={barCursor} />
            {stacked ? (
              <R.BarStack stackId="day" radius={[tokens.chart.barRadius, tokens.chart.barRadius, 0, 0]}>
                {barEls(R)}
              </R.BarStack>
            ) : (
              barEls(R)
            )}
            {target && <R.ReferenceLine y={target.value} {...targetStyle} />}
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
