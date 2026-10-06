// Owns: the Dashboard's headline metrics (pure) — the main numbers Aaron wants first, each with its value, a delta
// against the start of the window (or against its target), the daily series its sparkline draws, and a footnote saying
// exactly what the number is. Data in, tiles out: no React, no fetching (the `icon` is a component reference purely so
// the tile and the metric read as the same thing everywhere; nothing here renders).
import BedtimeRounded from '@mui/icons-material/BedtimeRounded'
import DirectionsWalkRounded from '@mui/icons-material/DirectionsWalkRounded'
import EggAltRounded from '@mui/icons-material/EggAltRounded'
import FitnessCenterRounded from '@mui/icons-material/FitnessCenterRounded'
import LocalFireDepartmentRounded from '@mui/icons-material/LocalFireDepartmentRounded'
import MonitorWeightRounded from '@mui/icons-material/MonitorWeightRounded'
import PercentRounded from '@mui/icons-material/PercentRounded'
import SpeedRounded from '@mui/icons-material/SpeedRounded'
import WaterDropRounded from '@mui/icons-material/WaterDropRounded'
import type { SvgIconComponent } from '@mui/icons-material'
import type { DaySummary } from '@fitness/shared/schemas'
import type { MetricKey } from '../../../theme'
import { confirmedScans } from '../../scans/charts'
import { effectiveRate, lastTrend } from '../../progress/series'
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
   * The weight this metric takes on the opening band's widest board, in tracks of 12. The tiles beside the goals rail
   * take 4 (two to a row), the ones under it take 3 (four to a row), and the hero takes 8 — the board's own track count,
   * so the spans of any single row add up to 12 and nothing is left half a row wide.
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
 * The window's main metrics, each tagged with the row of the band it belongs to (see `KpiGroup`); the band orders the
 * rows, so the file states what belongs together rather than where a card happens to land. Every series is one entry per
 * day of `data.days`, so the sparklines line up across the whole band. Three numbers the app used to show up here are
 * deliberately absent: sessions, fasts and the share of days logged are countable facts of the window, and the goals
 * rail beside the band already states all three — a fourth card repeating them would be the crowding this band exists
 * to avoid.
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
  const rate =
    trendNow && data.trend?.forecast ? effectiveRate(trendNow, data.trend.forecast, data.profile?.goal_weight_kg ?? trendNow.kg) : null

  const scans = confirmedScans(data.scans)
  const firstScan = scans[0]
  const scanNow = scans[scans.length - 1]
  const fatSeries = scans.map((s) => s.record.body_fat_pct)
  const leanSeries = scans.map((s) => s.record.lean_body_mass_kg)

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
    key: 'rate',
    label: 'Weekly rate',
    group: 'body',
    span: 4,
    value: rate === null ? null : round(rate, 2),
    unit: 'kg/wk',
    precision: 2,
    metric: 'weight',
    icon: SpeedRounded,
    footnote: data.trend?.forecast?.finish_date
      ? `On track to finish ${data.trend.forecast.finish_date}`
      : 'From the engine forecast',
  })

  push({
    key: 'body-fat',
    label: 'Body fat',
    group: 'body',
    span: 4,
    value: scanNow ? round(scanNow.record.body_fat_pct, 1) : null,
    unit: '%',
    precision: 1,
    metric: 'fatMass',
    icon: PercentRounded,
    series: fatSeries,
    delta:
      scanNow && firstScan && scanNow !== firstScan
        ? { value: round(scanNow.record.body_fat_pct - firstScan.record.body_fat_pct, 1), unit: 'pt', period: 'across scans', good: 'down' }
        : undefined,
    footnote: scans.length ? `${scans.length} confirmed ${scans.length === 1 ? 'scan' : 'scans'}` : 'No confirmed scan yet',
  })

  push({
    key: 'lean',
    label: 'Lean mass',
    group: 'body',
    span: 3,
    value: scanNow ? round(scanNow.record.lean_body_mass_kg, 1) : null,
    unit: 'kg',
    precision: 1,
    metric: 'lean',
    icon: FitnessCenterRounded,
    series: leanSeries,
    delta:
      scanNow && firstScan && scanNow !== firstScan
        ? { value: round(scanNow.record.lean_body_mass_kg - firstScan.record.lean_body_mass_kg, 1), period: 'across scans', good: 'up' }
        : undefined,
    footnote: 'From Evolt scans only',
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
    span: 3,
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
    span: 3,
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
    span: 3,
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
