// Owns: the Dashboard's headline metrics (pure) — the six numbers Aaron wants first, each with its value, a delta
// against the start of the window (or against its target), the daily series its sparkline draws, and a footnote saying
// exactly what the number is. Data in, tiles out: no React, no fetching (the `icon` is a component reference purely so
// the tile and the metric read as the same thing everywhere; nothing here renders).
import BedtimeRounded from '@mui/icons-material/BedtimeRounded'
import DirectionsWalkRounded from '@mui/icons-material/DirectionsWalkRounded'
import EggAltRounded from '@mui/icons-material/EggAltRounded'
import LocalFireDepartmentRounded from '@mui/icons-material/LocalFireDepartmentRounded'
import MonitorWeightRounded from '@mui/icons-material/MonitorWeightRounded'
import WaterDropRounded from '@mui/icons-material/WaterDropRounded'
import type { SvgIconComponent } from '@mui/icons-material'
import type { DaySummary } from '@fitness/shared/schemas'
import type { MetricKey } from '../../../theme'
import { lastTrend } from '../../progress/series'
import { goalProgress } from './GoalRail'
import type { DashboardData } from './useDashboardData'

/**
 * Which row of the opening bento a metric belongs to. The rows are the page's own categories — the body, what went in,
 * the way the body moved, and the daily habits — so a metric is never merely "in the band": it sits with its own kind,
 * in the same order the sections below use. The band lays the rows out in this order.
 */
export type KpiGroup = 'weight' | 'intake' | 'body' | 'habits'

/** SPEC §9 readiness compares sleep with 7.5 h. */
const SLEEP_TARGET_H = 7.5

export interface KpiDelta {
  value: number
  unit?: string
  /** What the delta is measured against, e.g. "since the window opened". */
  period: string
  /** Which direction is good: `down` for weight and body fat, `up` for lean and steps, `neutral` stays grey. */
  good: 'up' | 'down' | 'neutral'
}

export interface Kpi {
  key: string
  label: string
  group: KpiGroup
  /**
   * The weight this metric takes on the opening band's widest board, in tracks of 12. Every supporting tile takes 4
   * (three to a row) and the hero takes 8 — the board's own track count, so the row beside the goals rail adds up to 12
   * and nothing is left half a row wide.
   */
  span: number
  /** Tracks from `md` up, where the board has 6: two tiles across. Default 3. */
  mdSpan?: number
  value: number | null
  unit?: string
  /** Decimal places for the value. Default 0. */
  precision?: number
  delta?: KpiDelta
  metric?: MetricKey
  /**
   * How much of the goal is done, 0–1, for the one card that draws it as a bar. Only the trend weight carries one:
   * every other headline number is a mean over the window and has no single goal to sit against.
   */
  progress?: number | null
  /** The card's leading glyph, in the metric's colour. Decoration: the label always names the metric. */
  icon?: SvgIconComponent
  /** Daily values across the window, oldest first; null where the day has no value. */
  series?: readonly (number | null)[]
  /** A target drawn as a dashed line on the sparkline. */
  reference?: number
  footnote: string
}

const round = (v: number, places = 1) => Math.round(v * 10 ** places) / 10 ** places

/** Mean of the values that are present, or null when there are none. */
function mean(values: readonly (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null && Number.isFinite(v))
  return present.length ? present.reduce((sum, v) => sum + v, 0) / present.length : null
}

/** The last value present, or null. */
function last(values: readonly (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i]
    if (v !== null && v !== undefined && Number.isFinite(v)) return v
  }
  return null
}

/**
 * The window's six metrics, each tagged with the row of the band it belongs to (see `KpiGroup`); the band orders the
 * rows, so the file states what belongs together rather than where a card happens to land. Every series is one entry per
 * day of `data.days`, so the sparklines line up across the whole band. This is deliberately a short list: the weekly
 * rate, body fat and lean mass are slow-moving scan facts, and the Body section below draws all three against their own
 * history — repeating them as tiles was the crowding this band exists to avoid. Sessions, fasts and the share of days
 * logged sit in the goals rail beside the band.
 */
export function dashboardKpis(data: DashboardData): Kpi[] {
  const days = data.days
  // The weigh-in history runs the whole window even when the day rows are clipped to the profile's start date
  // (GET /api/days returns nothing before it), so the weight sparkline comes from the trend series itself.
  const weightSeries = (data.trend?.points ?? []).map((p) => p.trend_kg)
  const target = [...days].reverse().find((d) => d.targets && !d.is_fast_day)?.targets ?? null

  const trendNow = lastTrend(data.trend?.points ?? [])
  const trendStart = weightSeries.find((v) => v !== null) ?? null
  const goalDone = goalProgress(data.profile?.start_weight_kg ?? null, trendNow?.kg ?? null, data.profile?.goal_weight_kg ?? null)

  // Intake and recovery: means over the days they actually have a value (fast days have no meals by design).
  const kcalSeries = days.map((d) => (d.meals_logged > 0 && !d.is_fast_day ? Math.round(d.intake.kcal) : null))
  const proteinSeries = days.map((d) => (d.meals_logged > 0 && !d.is_fast_day ? Math.round(d.intake.protein_g) : null))
  const stepsSeries = days.map((d) => ((d.steps ?? 0) > 0 ? d.steps : null))
  const sleepSeries = days.map((d) => (d.sleep_min === null ? null : round(d.sleep_min / 60, 1)))
  const waterSeries = days.map((d) => (d.water_ml > 0 ? d.water_ml : null))
  const loggedDays = kcalSeries.filter((v) => v !== null).length
  const avgKcal = mean(kcalSeries)
  const avgProtein = mean(proteinSeries)
  const avgSteps = mean(stepsSeries)
  const avgSleep = mean(sleepSeries)
  const avgWater = mean(waterSeries)

  const out: Kpi[] = []
  const push = (kpi: Kpi) => out.push(kpi)

  push({
    key: 'weight',
    label: 'Trend weight',
    group: 'weight',
    span: 8,
    mdSpan: 6,
    progress: goalDone,
    value: trendNow?.kg ?? null,
    unit: 'kg',
    precision: 1,
    metric: 'weight',
    icon: MonitorWeightRounded,
    series: weightSeries,
    delta:
      trendNow && trendStart !== null
        ? { value: round(trendNow.kg - trendStart), period: 'this window', good: 'down' }
        : undefined,
    footnote: data.profile
      ? `Goal ${round(data.profile.goal_weight_kg, 1)} kg by ${data.profile.goal_date}`
      : 'Smoothed daily weight',
  })

  push({
    key: 'intake',
    label: 'Average intake',
    group: 'intake',
    span: 4,
    value: avgKcal === null ? null : Math.round(avgKcal),
    unit: 'kcal',
    metric: 'calories',
    icon: LocalFireDepartmentRounded,
    series: kcalSeries,
    reference: target?.kcal,
    delta:
      avgKcal !== null && target
        ? { value: Math.round(avgKcal - target.kcal), period: 'vs target', good: 'neutral' }
        : undefined,
    footnote: loggedDays ? `Over ${loggedDays} logged ${loggedDays === 1 ? 'day' : 'days'}, fasts excluded` : 'No meals logged yet',
  })

  push({
    key: 'protein',
    label: 'Protein',
    group: 'intake',
    span: 4,
    value: avgProtein === null ? null : Math.round(avgProtein),
    unit: 'g',
    metric: 'protein',
    icon: EggAltRounded,
    series: proteinSeries,
    reference: target?.protein_g,
    delta:
      avgProtein !== null && target
        ? { value: Math.round(avgProtein - target.protein_g), period: 'vs target', good: 'neutral' }
        : undefined,
    footnote: target ? `Daily average; target ${target.protein_g} g` : 'Daily average',
  })

  push({
    key: 'steps',
    label: 'Steps',
    group: 'habits',
    span: 4,
    value: avgSteps === null ? null : Math.round(avgSteps),
    metric: 'steps',
    icon: DirectionsWalkRounded,
    series: stepsSeries,
    reference: target?.steps,
    footnote: target ? `Daily average; target ${target.steps.toLocaleString()}` : 'Daily average',
  })

  push({
    key: 'sleep',
    label: 'Sleep',
    group: 'habits',
    span: 4,
    value: avgSleep === null ? null : round(avgSleep, 1),
    unit: 'h',
    precision: 1,
    metric: 'sleep',
    icon: BedtimeRounded,
    series: sleepSeries,
    reference: SLEEP_TARGET_H,
    footnote: `Hours asleep; ${SLEEP_TARGET_H} h is the readiness target`,
  })

  push({
    key: 'water',
    label: 'Water',
    group: 'habits',
    span: 4,
    value: avgWater === null ? null : Math.round(avgWater),
    unit: 'ml',
    metric: 'water',
    icon: WaterDropRounded,
    series: waterSeries,
    reference: target?.water_ml,
    footnote: target ? `Daily average; target ${target.water_ml.toLocaleString()} ml` : 'Daily average',
  })

  return out
}
