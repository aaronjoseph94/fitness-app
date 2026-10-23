// Owns: the four "per day vs target" charts — calories by meal slot (one distinct hue per slot: breakfast amber, lunch
// rose, dinner violet, snack blue; fast days a coral dot above the baseline), macros (g: protein orange, carbs violet,
// fat rose) with the protein minimum dashed in the warning amber, water (ml; days that hit the target in the
// water ramp, the rest in its light end) and steps with a 14-day median — as configurations of DailyBars.
import { formatNumber } from '../../components'
import { metricRamp, tokens } from '../../theme'
import { DailyBars, type DaySeries } from './DailyBars'
import { UNDER_TARGET_ALPHA, tintOnCard, type ChartSizeProps } from './frame'
import { rollingMedian } from './stats'

interface Common extends ChartSizeProps {
  /** Draw the legend chips. Default true. */
  legend?: boolean
  /** Where the legend keys sit: the top row (default) or under the plot. */
  legendPlacement?: 'top' | 'bottom'
}

// ---------------------------------------------------------------------------------------------------------------

export type MealSlotKey = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface CaloriesDay {
  date: string
  breakfast?: number | null
  lunch?: number | null
  dinner?: number | null
  snack?: number | null
  /** A fast day: expected intake 0, marked on the baseline. */
  fast?: boolean
}

export interface CaloriesChartProps extends Common {
  days: readonly CaloriesDay[]
  /** Daily target, kcal (dashed line). */
  target?: number
}

const KCAL = metricRamp('calories')
/**
 * Slots stacked in eating order (breakfast at the base), each its own hue so neighbours never read as one pink:
 * breakfast amber, lunch the calories rose, dinner violet, snack the sleep blue. The fast-day dot (coral) is a dot
 * above the baseline, not a segment.
 */
const SLOTS: readonly { key: MealSlotKey; label: string; color: string }[] = [
  { key: 'breakfast', label: 'Breakfast', color: metricRamp('protein').from },
  { key: 'lunch', label: 'Lunch', color: KCAL.from },
  { key: 'dinner', label: 'Dinner', color: tokens.accent.bright },
  { key: 'snack', label: 'Snack', color: tokens.metric.sleep },
]

const kcal = (v: number) => `${formatNumber(v)} kcal`

export function CaloriesChart({
  days,
  target,
  width,
  height = 220,
  legend = true,
  legendPlacement,
}: CaloriesChartProps) {
  const present = SLOTS.filter((s) => days.some((d) => (d[s.key] ?? 0) > 0))
  const bars: DaySeries[] = present.map((s) => ({ key: s.key, label: s.label, color: s.color }))
  return (
    <DailyBars
      testId="chart-calories"
      label="Calories per day by meal slot"
      unit="kcal"
      rows={days}
      bars={bars}
      target={target === undefined ? undefined : { value: target, label: 'Target', color: tokens.ink.text }}
      marker={{ key: 'fast', label: 'Fast day', color: tokens.metric.fasting }}
      format={kcal}
      width={width}
      height={height}
      legend={legend}
      legendPlacement={legendPlacement}
    />
  )
}

// ---------------------------------------------------------------------------------------------------------------

export interface MacrosDay {
  date: string
  protein?: number | null
  carbs?: number | null
  fat?: number | null
}

export interface MacrosChartProps extends Common {
  days: readonly MacrosDay[]
  /** Protein target, g (dashed line; protein is the bottom segment so the two compare directly). */
  proteinTarget?: number
}

const grams = (v: number) => `${formatNumber(v)} g`

export function MacrosChart({
  days,
  proteinTarget,
  width,
  height = 220,
  legend = true,
  legendPlacement,
}: MacrosChartProps) {
  return (
    <DailyBars
      testId="chart-macros"
      label="Macros per day in grams"
      unit="g"
      rows={days}
      bars={[
        { key: 'protein', label: 'Protein', color: metricRamp('protein').from },
        { key: 'carbs', label: 'Carbs', color: tokens.accent.bright },
        // Fat in its rose (metric.fat), apart from protein's amber-orange and carbs' violet.
        { key: 'fat', label: 'Fat', color: tokens.metric.fat },
      ]}
      target={
        proteinTarget === undefined
          ? undefined
          : { value: proteinTarget, label: 'Protein minimum', color: tokens.tone.warning.text }
      }
      format={grams}
      width={width}
      height={height}
      legend={legend}
      legendPlacement={legendPlacement}
    />
  )
}

// ---------------------------------------------------------------------------------------------------------------

export interface WaterDay {
  date: string
  ml?: number | null
}

export interface WaterChartProps extends Common {
  days: readonly WaterDay[]
  /** Daily target, ml. */
  target?: number
}

export function WaterChart({ days, target, width, height = 200, legend = true }: WaterChartProps) {
  return (
    <DailyBars
      testId="chart-water"
      label="Water per day in millilitres"
      unit="ml"
      rows={days}
      bars={[
        {
          key: 'ml',
          label: 'Water',
          color: tokens.metric.water,
          ramp: 'water',
          missColor: tintOnCard(tokens.metric.water, UNDER_TARGET_ALPHA),
        },
      ]}
      target={target === undefined ? undefined : { value: target, label: 'Target' }}
      format={(v) => `${formatNumber(v)} ml`}
      width={width}
      height={height}
      legend={legend && target !== undefined}
    />
  )
}

// ---------------------------------------------------------------------------------------------------------------

export interface StepsDay {
  date: string
  steps?: number | null
}

export interface StepsChartProps extends Common {
  days: readonly StepsDay[]
  /** Optional daily target (dashed). */
  target?: number
}

/** Bars are the steps colour at 45 % (opaque); the 14-day trailing median is the full-colour line over them. */
export function StepsChart({ days, target, width, height = 200, legend = true }: StepsChartProps) {
  const medians = rollingMedian(
    days.map((d) => d.steps),
    14,
  )
  const rows = days.map((d, i) => ({ ...d, median: medians[i] === null ? null : Math.round(medians[i]!) }))
  return (
    <DailyBars
      testId="chart-steps"
      label="Steps per day with 14-day median"
      unit="steps"
      rows={rows}
      bars={[{ key: 'steps', label: 'Steps', color: tintOnCard(tokens.metric.steps, 0.45) }]}
      line={{ key: 'median', label: '14-day median', color: tokens.metric.steps }}
      target={target === undefined ? undefined : { value: target, label: 'Target' }}
      format={(v) => formatNumber(v)}
      width={width}
      height={height}
      legend={legend}
    />
  )
}
