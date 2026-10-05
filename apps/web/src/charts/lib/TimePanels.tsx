// Owns: the one implementation behind every "values over dates" line chart that is not the weight hero: one or
// more stacked panels (small multiples, never a second y-axis) sharing a time axis and a synced crosshair, each
// with its own unit, lines and/or dots, and an optional dashed target. Used by body composition, body fat and
// visceral level, waist and WHR, and strength.
import { useId } from 'react'
import { CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import Box from '@mui/material/Box'
import { formatShortDate, type LegendItem } from '../../components'
import { tokens } from '../../theme'
import {
  AxisCaption,
  ChartFrame,
  MARGIN,
  dotStyle,
  field,
  gridStyle,
  lineCursor,
  lineStyle,
  niceScale,
  num,
  rechartsSize,
  targetStyle,
  tooltip,
  xAxisStyle,
  yAxisStyle,
  type DayRow,
} from './frame'
import { dateToTime, timeAxis } from './time'

export interface TimeSeries {
  key: string
  label: string
  color: string
  /** `line` (2 px, dots at each point) or `dots` only. Default `line`. */
  kind?: 'line' | 'dots'
  format: (v: number) => string
}

export interface TimePanel {
  /** Unit caption above the panel's y ticks, e.g. "kg" or "Body fat %". */
  unit: string
  series: readonly TimeSeries[]
  target?: { value: number; label: string }
  height?: number
  /** Decimal places on y ticks. Default 0. */
  tickPrecision?: number
}

export interface TimePanelsProps {
  testId: string
  label: string
  rows: readonly DayRow[]
  panels: readonly TimePanel[]
  width?: number
  legend: boolean
  /** Show every point's date as a tick (sparse data such as scans). Default: when ≤ 6 rows. */
  tickEveryPoint?: boolean
}

export function TimePanels({ testId, label, rows, panels, width, legend, tickEveryPoint }: TimePanelsProps) {
  const syncId = useId()
  const data = rows.map((r) => ({ ...r, t: dateToTime(r.date) })).sort((a, b) => a.t - b.t)
  const times = data.map((r) => r.t)
  const axis = data.length ? timeAxis(times) : null
  const everyPoint = tickEveryPoint ?? data.length <= 6
  const pad = axis ? Math.max((axis.domain[1] - axis.domain[0]) * 0.04, 86_400_000) : 0
  const total = panels.reduce((s, p) => s + (p.height ?? 180), 0)

  const items: LegendItem[] = []
  for (const p of panels) {
    for (const s of p.series)
      if (!items.some((i) => i.label === s.label))
        items.push({ label: s.label, color: s.color, mark: s.kind === 'dots' ? 'dot' : 'line' })
    if (p.target && !items.some((i) => i.label === p.target!.label))
      items.push({ label: p.target.label, color: tokens.chart.target, mark: 'dashed' })
  }

  return (
    <ChartFrame
      testId={testId}
      label={label}
      legend={legend ? items : undefined}
      width={width}
      height={total}
      empty={!axis}
    >
      {axis &&
        panels.map((p, i) => {
          const last = i === panels.length - 1
          const values = data
            .flatMap((r) => p.series.map((s) => num(field(r, s.key))))
            .filter((v): v is number => v !== null)
          if (p.target) values.push(p.target.value)
          const y = niceScale(values, { count: 3, minStep: 10 ** -(p.tickPrecision ?? 0) })
          const h = p.height ?? 180
          const Tip = tooltip<DayRow>(
            (r) => r.date,
            [
              ...p.series.map((s) => ({
                label: s.label,
                color: s.color,
                value: (r: DayRow) => {
                  const v = num(field(r, s.key))
                  return v === null ? null : s.format(v)
                },
              })),
              ...(p.target
                ? [
                    {
                      label: p.target.label,
                      color: tokens.chart.target,
                      dashed: true,
                      value: () => p.series[0]!.format(p.target!.value),
                    },
                  ]
                : []),
            ],
          )
          return (
            <Box key={i}>
              <AxisCaption first={i === 0}>{p.unit}</AxisCaption>
              <ComposedChart
                data={data}
                margin={MARGIN}
                syncId={syncId}
                {...rechartsSize(width, last ? h : h - 24)}
              >
                <CartesianGrid {...gridStyle} />
                <XAxis
                  {...xAxisStyle}
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={[axis.domain[0] - pad, axis.domain[1] + pad]}
                  ticks={everyPoint ? times : axis.ticks}
                  tickFormatter={everyPoint ? (t: number) => formatShortDate(t) : axis.format}
                  hide={!last}
                />
                <YAxis
                  {...yAxisStyle}
                  domain={y.domain}
                  ticks={y.ticks}
                  tickFormatter={(v: number) => v.toFixed(p.tickPrecision ?? 0)}
                />
                <Tooltip content={Tip} cursor={lineCursor} />
                {p.target && <ReferenceLine y={p.target.value} {...targetStyle} />}
                {p.series.map((s) =>
                  s.kind === 'dots' ? (
                    <Line
                      key={s.key}
                      dataKey={s.key}
                      stroke="none"
                      dot={dotStyle(s.color)}
                      activeDot={dotStyle(s.color, 5)}
                      isAnimationActive={false}
                    />
                  ) : (
                    <Line
                      key={s.key}
                      dataKey={s.key}
                      stroke={s.color}
                      {...lineStyle}
                      type="linear"
                      dot={dotStyle(s.color)}
                      activeDot={dotStyle(s.color, 5)}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ),
                )}
              </ComposedChart>
            </Box>
          )
        })}
    </ChartFrame>
  )
}
