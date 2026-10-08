// Owns: the body-composition charts across scans and tape measurements — fat vs lean mass per scan (2a: grouped
// bars, fat then lean, the kg written on each, the fat-at-goal line dashed in the goal colour), and body fat % and
// visceral level, waist and waist-to-hip ratio as TimePanels configurations (separate panels, one axis each).
import { formatNumber, formatShortDate, type LegendItem } from '../../components'
import { tokens, withAlpha } from '../../theme'
import {
  ChartFrame,
  MARGIN,
  WEEK_BAR_MAX,
  BAR_RADIUS,
  barCursor,
  barMotion,
  barXAxisStyle,
  gridStyle,
  niceScale,
  rechartsSize,
  seriesSummary,
  surfaceText,
  targetLine,
  tickCount,
  tickInterval,
  tooltip,
  yAxisStyle,
  type ChartSizeProps,
} from './frame'
import { Plot } from './plot'
import { TimePanels } from './TimePanels'

interface Common extends ChartSizeProps {
  /** Draw the legend chips. Default true. */
  legend?: boolean
}

const kg = (v: number) => `${formatNumber(v, 1)} kg`

// ---------------------------------------------------------------------------------------------------------------

export interface CompositionScan {
  date: string
  fatMass?: number | null
  leanMass?: number | null
}

export interface BodyCompositionChartProps extends Common {
  scans: readonly CompositionScan[]
  /** Fat mass at goal, kg (SPEC §3: ~11.7 kg). Dashed. */
  fatTarget?: number
}

const FAT = tokens.metric.fatMass
const LEAN = tokens.metric.lean
/** Narrowest bar whose kg is written over it (12/600, "59.6" is ~26 px); narrower bars label the latest scan only. */
const LABEL_MIN_BAR_PX = 30

/** The kg over a bar: on every scan while the bars are wide enough, else on the latest scan's pair only. */
function kgLabel(last: number) {
  return function KgLabel(props: {
    x?: number | string
    y?: number | string
    width?: number | string
    value?: unknown
    index?: number
  }) {
    const v = typeof props.value === 'number' ? props.value : null
    const w = Number(props.width ?? 0)
    if (v === null || (w < LABEL_MIN_BAR_PX && props.index !== last)) return null
    return (
      <text
        x={Number(props.x ?? 0) + w / 2}
        y={Number(props.y ?? 0) - 6}
        textAnchor="middle"
        fontSize={w < LABEL_MIN_BAR_PX ? tokens.chart.axisFontSize : tokens.font.size.caption}
        fontWeight={tokens.font.weight.heading}
        fill={tokens.ink.text}
      >
        {formatNumber(v, 1)}
      </text>
    )
  }
}

export function BodyCompositionChart({
  scans,
  fatTarget,
  width,
  height = 220,
  legend = true,
}: BodyCompositionChartProps) {
  const rows = [...scans].sort((a, b) => a.date.localeCompare(b.date))
  const values = rows.flatMap((r) => [r.fatMass ?? 0, r.leanMass ?? 0])
  if (fatTarget !== undefined) values.push(fatTarget)
  // Headroom for the kg written over the tallest bar.
  const top = Math.max(0, ...values)
  const y = niceScale([...values, top * 1.12], { zero: true, count: tickCount(height, 3) })
  const items: LegendItem[] = [
    { label: 'Fat mass', color: FAT, mark: 'bar' },
    { label: 'Lean mass', color: LEAN, mark: 'bar' },
  ]
  if (fatTarget !== undefined) items.push({ label: 'Fat at goal', color: FAT, mark: 'dashed' })
  const kgOrNull = (v: number | null | undefined) => (v === null || v === undefined ? null : kg(v))
  const Tip = tooltip<CompositionScan>(
    (r) => `Scan ${r.date}`,
    [
      { label: 'Fat mass', color: FAT, value: (r) => kgOrNull(r.fatMass) },
      { label: 'Lean mass', color: LEAN, value: (r) => kgOrNull(r.leanMass) },
      ...(fatTarget !== undefined
        ? [{ label: 'Fat at goal', color: FAT, dashed: true, value: () => kg(fatTarget) }]
        : []),
    ],
  )
  const label = 'Fat mass and lean mass per scan'
  const summary = [
    `Fat mass ${seriesSummary(
      rows.map((r) => ({ date: r.date, value: r.fatMass })),
      kg,
    )}`,
    `Lean mass ${seriesSummary(
      rows.map((r) => ({ date: r.date, value: r.leanMass })),
      kg,
    )}`,
    fatTarget !== undefined ? `Fat at goal ${kg(fatTarget)}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
  const last = rows.length - 1
  return (
    <ChartFrame
      testId="chart-body-composition"
      label={label}
      legend={legend ? items : undefined}
      unit="kg"
      width={width}
      height={height}
      empty={rows.length === 0}
    >
      <Plot width={width} height={height}>
        {(R, plotWidth) => (
          <R.BarChart
            data={rows}
            margin={MARGIN}
            barCategoryGap="28%"
            barGap={6}
            {...rechartsSize(width, height)}
            {...surfaceText(label, summary)}
          >
            <R.CartesianGrid {...gridStyle} />
            <R.XAxis
              {...barXAxisStyle}
              dataKey="date"
              tickFormatter={(d: string) => formatShortDate(d)}
              interval={tickInterval(rows.length, plotWidth)}
            />
            <R.YAxis
              {...yAxisStyle}
              domain={y.domain}
              ticks={y.ticks}
              tickFormatter={(v: number) => formatNumber(v)}
            />
            <R.Tooltip content={Tip} cursor={barCursor} />
            <R.Bar
              dataKey="fatMass"
              name="Fat mass"
              fill={FAT}
              maxBarSize={WEEK_BAR_MAX}
              radius={BAR_RADIUS}
              {...barMotion(width)}
            >
              <R.LabelList dataKey="fatMass" content={kgLabel(last)} />
            </R.Bar>
            <R.Bar
              dataKey="leanMass"
              name="Lean mass"
              fill={LEAN}
              maxBarSize={WEEK_BAR_MAX}
              radius={BAR_RADIUS}
              {...barMotion(width)}
            >
              <R.LabelList dataKey="leanMass" content={kgLabel(last)} />
            </R.Bar>
            {fatTarget !== undefined && <R.ReferenceLine y={fatTarget} {...targetLine(FAT)} />}
          </R.BarChart>
        )}
      </Plot>
    </ChartFrame>
  )
}

// ---------------------------------------------------------------------------------------------------------------

export interface FatScan {
  date: string
  bodyFatPct?: number | null
  visceralLevel?: number | null
}

export interface BodyFatVisceralChartProps extends Common {
  scans: readonly FatScan[]
  /** Body fat % target (SPEC §3: ≤ 18 % at goal). */
  bodyFatTarget?: number
  /** Top of the balanced visceral range (Evolt: 9). */
  visceralTarget?: number
}

export function BodyFatVisceralChart({
  scans,
  bodyFatTarget,
  visceralTarget,
  width,
  height = 300,
  legend = true,
}: BodyFatVisceralChartProps) {
  return (
    <TimePanels
      testId="chart-body-fat-visceral"
      label="Body fat percentage and visceral fat level per scan"
      rows={scans}
      width={width}
      legend={legend}
      panels={[
        {
          unit: 'Body fat %',
          height: Math.round(height * 0.5),
          series: [
            {
              key: 'bodyFatPct',
              label: 'Body fat',
              color: tokens.metric.fatMass,
              format: (v) => `${formatNumber(v, 1)} %`,
            },
          ],
          target: bodyFatTarget === undefined ? undefined : { value: bodyFatTarget, label: 'Target' },
        },
        {
          unit: 'Visceral level',
          height: Math.round(height * 0.5),
          series: [
            {
              key: 'visceralLevel',
              label: 'Visceral level',
              color: withAlpha(tokens.metric.fatMass, 0.6),
              format: (v) => formatNumber(v, 0),
            },
          ],
          target: visceralTarget === undefined ? undefined : { value: visceralTarget, label: 'Target' },
        },
      ]}
    />
  )
}

// ---------------------------------------------------------------------------------------------------------------

export interface WaistPoint {
  date: string
  /** Waist at the navel, cm. */
  waist?: number | null
  /** Waist-to-hip ratio. */
  whr?: number | null
}

export interface WaistWhrChartProps extends Common {
  points: readonly WaistPoint[]
  /** WHR target (SPEC §3: under 0.90). */
  whrTarget?: number
}

export function WaistWhrChart({ points, whrTarget, width, height = 300, legend = true }: WaistWhrChartProps) {
  return (
    <TimePanels
      testId="chart-waist-whr"
      label="Waist circumference and waist-to-hip ratio"
      rows={points}
      width={width}
      legend={legend}
      panels={[
        {
          unit: 'Waist, cm',
          height: Math.round(height * 0.5),
          series: [
            {
              key: 'waist',
              label: 'Waist',
              color: tokens.metric.weight,
              format: (v) => `${formatNumber(v, 1)} cm`,
            },
          ],
        },
        {
          unit: 'Waist-to-hip ratio',
          height: Math.round(height * 0.5),
          tickPrecision: 2,
          series: [
            {
              key: 'whr',
              label: 'WHR',
              color: withAlpha(tokens.metric.weight, 0.6),
              format: (v) => formatNumber(v, 2),
            },
          ],
          target: whrTarget === undefined ? undefined : { value: whrTarget, label: 'WHR target' },
        },
      ]}
    />
  )
}
