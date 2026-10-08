// Owns: the sleep chart — hours asleep as bars against the 7.5 h target (2a: nights that reach it in the sleep
// colour, the rest in its light step), and bedtime as ringed dots in a second panel on the same date axis (two
// panels, never a second y-axis). Bedtimes span midnight on one continuous scale.
import { useId } from 'react'
import { formatNumber, type LegendItem } from '../../components'
import { tokens } from '../../theme'
import {
  AxisCaption,
  BAR_MAX,
  BAR_RADIUS,
  ChartFrame,
  DAY_LABEL_PX,
  DAY_NUMBER_MAX,
  MARGIN,
  UNDER_TARGET_ALPHA,
  dataEndBarPath,
  dateSpan,
  barCursor,
  barMotion,
  dayTick,
  tickCount,
  tickInterval,
  dotStyle,
  gridStyle,
  niceScale,
  rechartsSize,
  ringDot,
  seriesSummary,
  surfaceText,
  targetStyle,
  tintOnCard,
  tooltip,
  xAxisStyle,
  yAxisStyle,
  type ChartSizeProps,
} from './frame'
import { Plot } from './plot'
import { bedtimeLabel, bedtimeMinutes } from './stats'

export interface SleepNight {
  /** The local date the night ended (wake date). */
  date: string
  /** Hours asleep. */
  hours?: number | null
  /** Local in-bed time "HH:MM", e.g. "23:40". */
  bedtime?: string | null
}

export interface SleepChartProps extends ChartSizeProps {
  nights: readonly SleepNight[]
  /** Target hours (SPEC §7 readiness uses 7.5 h). */
  target?: number
  legend?: boolean
}

interface Row extends SleepNight {
  bed: number | null
}

const C = tokens.metric.sleep
/** A night short of the target: the sleep colour's lighter step. */
const SHORT = tintOnCard(C, UNDER_TARGET_ALPHA)

/** One night's bar: full colour at or over the target, the light step under it. */
function nightBar(target: number | undefined) {
  return function NightBar(p: {
    x?: number
    y?: number
    width?: number
    height?: number
    payload?: unknown
  }) {
    const hours = (p.payload as Row | undefined)?.hours
    const d = dataEndBarPath(p.x ?? 0, p.y ?? 0, p.width ?? 0, p.height ?? 0, true)
    const short = target !== undefined && typeof hours === 'number' && hours < target
    return d ? <path d={d} fill={short ? SHORT : C} /> : <g />
  }
}

export function SleepChart({ nights, target, width, height = 300, legend = true }: SleepChartProps) {
  const syncId = useId()
  const rows: Row[] = nights.map((n) => ({ ...n, bed: n.bedtime ? bedtimeMinutes(n.bedtime) : null }))
  const topH = Math.round(height * 0.52)
  const bottomH = height - topH
  const hours = niceScale([...rows.map((r) => r.hours ?? 0), target ?? 0], {
    zero: true,
    count: tickCount(topH, 3),
  })
  const beds = rows.map((r) => r.bed).filter((v): v is number => v !== null)
  const bedMin = beds.length ? Math.floor(Math.min(...beds) / 60) * 60 : 240
  const bedMax = beds.length ? Math.ceil(Math.max(...beds) / 60) * 60 : 360
  // Hourly bedtime ticks, every second hour when the panel is too short for one label per hour.
  const bedSpan = Math.max(bedMax, bedMin + 60) - bedMin
  const bedStep = bedSpan / 60 + 1 > tickCount(bottomH) ? 120 : 60
  const bedTicks: number[] = []
  for (let m = bedMin; m <= bedMin + Math.ceil(bedSpan / bedStep) * bedStep; m += bedStep) bedTicks.push(m)
  const motion = barMotion(width)

  const Tip = tooltip<Row>(
    (r) => r.date,
    [
      { label: 'Asleep', color: C, value: (r) => (r.hours == null ? null : `${formatNumber(r.hours, 1)} h`) },
      { label: 'Bedtime', color: C, value: (r) => r.bedtime ?? null },
      ...(target !== undefined
        ? [
            {
              label: 'Target',
              color: tokens.chart.target,
              dashed: true,
              value: () => `${formatNumber(target, 1)} h`,
            },
          ]
        : []),
    ],
  )
  const items: LegendItem[] = [
    { label: 'Hours asleep', color: C, mark: 'bar' },
    ...(target !== undefined && rows.some((r) => r.hours != null && r.hours < target)
      ? [{ label: 'Under target', color: SHORT, mark: 'bar' as const }]
      : []),
    { label: 'Bedtime', color: C, mark: 'ring' },
  ]
  if (target !== undefined) items.push({ label: 'Target', color: tokens.chart.target, mark: 'dashed' })
  const hoursSummary =
    `Hours asleep ${seriesSummary(
      rows.map((r) => ({ date: r.date, value: r.hours })),
      (v) => `${formatNumber(v, 1)} h`,
    )}` + (target !== undefined ? ` Target ${formatNumber(target, 1)} h.` : '')
  const lastBed = rows.filter((r) => r.bed !== null).at(-1)
  const bedSummary = lastBed
    ? `Bedtimes ${dateSpan(rows.map((r) => r.date))}: last ${bedtimeLabel(lastBed.bed!)}, earliest ${bedtimeLabel(Math.min(...beds))}, latest ${bedtimeLabel(Math.max(...beds))}.`
    : 'No bedtimes yet.'

  return (
    <ChartFrame
      testId="chart-sleep"
      label="Sleep hours and bedtime per night"
      legend={legend ? items : undefined}
      width={width}
      height={height}
      empty={nights.length === 0}
    >
      <AxisCaption>Hours asleep</AxisCaption>
      <Plot width={width} height={topH}>
        {(R) => (
          <R.ComposedChart
            data={rows}
            margin={MARGIN}
            syncId={syncId}
            barCategoryGap="16%"
            {...rechartsSize(width, topH)}
            {...surfaceText('Hours asleep per night', hoursSummary)}
          >
            <R.CartesianGrid {...gridStyle} />
            <R.XAxis {...xAxisStyle} dataKey="date" hide />
            <R.YAxis {...yAxisStyle} domain={hours.domain} ticks={hours.ticks} />
            <R.Tooltip content={Tip} cursor={barCursor} />
            <R.Bar
              dataKey="hours"
              fill={C}
              maxBarSize={BAR_MAX}
              radius={BAR_RADIUS}
              shape={nightBar(target)}
              {...motion}
            />
            <R.ReferenceLine y={0} stroke={tokens.chart.baseline} strokeWidth={1} />
            {target !== undefined && <R.ReferenceLine y={target} {...targetStyle} />}
          </R.ComposedChart>
        )}
      </Plot>
      <AxisCaption first={false}>Bedtime</AxisCaption>
      <Plot width={width} height={bottomH}>
        {(R, plotWidth) => (
          <R.ComposedChart
            data={rows}
            margin={MARGIN}
            syncId={syncId}
            {...rechartsSize(width, bottomH)}
            {...surfaceText('Bedtime per night', bedSummary)}
          >
            <R.CartesianGrid {...gridStyle} />
            <R.XAxis
              {...xAxisStyle}
              dataKey="date"
              tickFormatter={dayTick(rows.length)}
              interval={tickInterval(
                rows.length,
                plotWidth,
                48,
                rows.length <= DAY_NUMBER_MAX ? DAY_LABEL_PX : undefined,
              )}
            />
            <R.YAxis
              {...yAxisStyle}
              width={48}
              domain={[bedMin - 10, bedTicks.at(-1)! + 10]}
              ticks={bedTicks}
              interval={0}
              tickFormatter={bedtimeLabel}
              reversed
            />
            <R.Tooltip content={Tip} cursor={barCursor} />
            <R.Line
              dataKey="bed"
              stroke="none"
              dot={ringDot(C)}
              activeDot={dotStyle(C, 4.5)}
              isAnimationActive={false}
            />
          </R.ComposedChart>
        )}
      </Plot>
    </ChartFrame>
  )
}
