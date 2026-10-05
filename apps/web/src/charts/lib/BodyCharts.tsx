// Owns: the body-composition charts across scans and tape measurements — fat vs lean mass, body fat % and
// visceral level, waist and waist-to-hip ratio — as TimePanels configurations (separate panels, one axis each).
import { formatNumber } from '../../components'
import { tokens, withAlpha } from '../../theme'
import type { ChartSizeProps } from './frame'
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

export function BodyCompositionChart({
  scans,
  fatTarget,
  width,
  height = 220,
  legend = true,
}: BodyCompositionChartProps) {
  return (
    <TimePanels
      testId="chart-body-composition"
      label="Fat mass and lean mass per scan"
      rows={scans}
      width={width}
      legend={legend}
      panels={[
        {
          unit: 'kg',
          height,
          series: [
            { key: 'leanMass', label: 'Lean mass', color: tokens.metric.lean, format: kg },
            { key: 'fatMass', label: 'Fat mass', color: tokens.metric.fatMass, format: kg },
          ],
          target: fatTarget === undefined ? undefined : { value: fatTarget, label: 'Fat target' },
        },
      ]}
    />
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
