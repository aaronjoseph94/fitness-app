// Owns: segmental fat change — one row per segment (arms, torso, legs), baseline vs latest fat kg as grouped
// horizontal bars, the change written at the end of each row.
import { formatNumber, formatSigned, type LegendItem } from '../../components'
import { tokens, withAlpha } from '../../theme'
import {
  ChartFrame,
  animated,
  barCursor,
  niceScale,
  rechartsSize,
  surfaceText,
  tickInterval,
  tooltip,
  xAxisStyle,
  yAxisStyle,
  type ChartSizeProps,
} from './frame'
import { Plot } from './plot'

export interface SegmentFat {
  /** Display label, e.g. "Left arm". */
  segment: string
  /** Fat kg at the baseline scan. */
  baseline: number
  /** Fat kg at the latest scan. */
  latest: number
}

export interface SegmentalFatChartProps extends ChartSizeProps {
  segments: readonly SegmentFat[]
  /** Legend labels, e.g. dates. Default "Baseline" / "Latest". */
  baselineLabel?: string
  latestLabel?: string
  legend?: boolean
}

const C = tokens.metric.fatMass

export function SegmentalFatChart({
  segments,
  baselineLabel = 'Baseline',
  latestLabel = 'Latest',
  width,
  height,
  legend = true,
}: SegmentalFatChartProps) {
  const h = height ?? 40 + segments.length * 44
  const x = niceScale(
    segments.flatMap((s) => [s.baseline, s.latest]),
    { zero: true, count: 4 },
  )
  const rows = segments.map((s) => ({ ...s, delta: `${formatSigned(s.latest - s.baseline, 1)} kg` }))
  const kg = (v: number) => `${formatNumber(v, 2)} kg`
  const Tip = tooltip<(typeof rows)[number]>(
    (r) => r.segment,
    [
      { label: latestLabel, color: C, value: (r) => kg(r.latest) },
      { label: baselineLabel, color: withAlpha(C, 0.35), value: (r) => kg(r.baseline) },
      { label: 'Change', color: tokens.ink.text, value: (r) => r.delta },
    ],
  )
  const items: LegendItem[] = [
    { label: baselineLabel, color: withAlpha(C, 0.35), mark: 'bar' },
    { label: latestLabel, color: C, mark: 'bar' },
  ]
  const radius: [number, number, number, number] = [0, tokens.chart.barRadius, tokens.chart.barRadius, 0]
  const label = 'Segmental fat at baseline and latest scan'
  const summary = rows.map((r) => `${r.segment}: ${kg(r.baseline)} to ${kg(r.latest)} (${r.delta})`).join('; ')
  return (
    <ChartFrame
      testId="chart-segmental-fat"
      label={label}
      legend={legend ? items : undefined}
      width={width}
      height={h}
      empty={segments.length === 0}
    >
      <Plot width={width} height={h}>
        {(R, plotWidth) => (
          <R.BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 0, right: 56, bottom: 0, left: 0 }}
            barCategoryGap="22%"
            barGap={2}
            {...rechartsSize(width, h)}
            {...surfaceText(label, summary)}
          >
            <R.CartesianGrid stroke={tokens.chart.grid} horizontal={false} />
            <R.XAxis
              {...xAxisStyle}
              type="number"
              domain={x.domain}
              ticks={x.ticks}
              tickFormatter={(v: number) => `${formatNumber(v)}`}
              unit=" kg"
              interval={tickInterval(x.ticks.length, plotWidth, 84)}
            />
            <R.YAxis {...yAxisStyle} type="category" dataKey="segment" width={84} />
            <R.Tooltip content={Tip} cursor={barCursor} />
            <R.Bar
              dataKey="baseline"
              fill={withAlpha(C, 0.35)}
              maxBarSize={12}
              radius={radius}
              isAnimationActive={animated(width)}
            />
            <R.Bar dataKey="latest" fill={C} maxBarSize={12} radius={radius} isAnimationActive={animated(width)}>
              <R.LabelList
                dataKey="delta"
                position="right"
                offset={8}
                fill={tokens.ink.text}
                fontSize={12}
                fontWeight={600}
              />
            </R.Bar>
          </R.BarChart>
        )}
      </Plot>
    </ChartFrame>
  )
}
