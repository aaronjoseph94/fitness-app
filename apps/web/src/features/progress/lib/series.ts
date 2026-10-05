// Owns: the pure mapping from API data (TrendSeries, DaySummary rows, fasts, the forecast) to the chart kit's plain
// series, plus the small aggregates the Progress summary shows. No React, no fetching: data in, series out.
import { addDays, dayAdherence, daysBetween, localDate, localTime, weekStart } from '@fitness/shared/engine'
import type {
  DaySummary,
  Fast,
  Forecast,
  LocalDate,
  Measurement,
  Milestone as MilestoneRow,
  TargetValues,
  TrendPoint,
} from '@fitness/shared/schemas'
import type {
  CaloriesDay,
  FastEntry,
  ForecastPoint,
  HeatmapDay,
  MacrosDay,
  Milestone,
  SleepNight,
  StepsDay,
  WaistPoint,
  WaterDay,
  WeeklyLossPoint,
  WeightMilestone,
  WeightPoint,
} from '../../../charts'

const round = (v: number, places = 2) => Math.round(v * 10 ** places) / 10 ** places

// ── Weight ─────────────────────────────────────────────────────────────────────────────────────────────────────

export function weightPoints(points: readonly TrendPoint[]): WeightPoint[] {
  return points.map((p) => ({ date: p.date, raw: p.weight_kg, trend: p.trend_kg }))
}

/** The last day that has a trend weight. */
export function lastTrend(points: readonly TrendPoint[]): { date: LocalDate; kg: number } | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i]!
    if (p.trend_kg !== null) return { date: p.date, kg: p.trend_kg }
  }
  return null
}

const MAX_FORECAST_WEEKS = 104

/**
 * The forecast drawn from the last trend point, one point a week, ending on the finish date (mid = goal) or at
 * `horizonDays`, whichever comes first. Empty when the rate is not a loss. When the forecast has a finish date the
 * mid line is anchored to it, so the chart and the header's "projected finish" agree:
 *   rate    = (trend − goal) / (weeks from the last trend date to finish_date)   (else weekly_rate_kg)
 *   mid(w)  = trend − rate × w
 *   low(w)  = max(goal, trend − rate × (band.high / weekly_rate_kg) × w)   (SPEC §9: band = rate × (1 ∓ 0.20))
 *   high(w) = max(goal, trend − rate × (band.low / weekly_rate_kg) × w)
 */
export function forecastPath(input: {
  from: { date: LocalDate; kg: number }
  forecast: Pick<Forecast, 'weekly_rate_kg' | 'band'> & { finish_date?: LocalDate | null }
  goalKg: number
  horizonDays?: number
}): ForecastPoint[] {
  const { from, forecast, goalKg } = input
  const rate = effectiveRate(from, forecast, goalKg)
  if (rate === null || from.kg <= goalKg) return []
  const fast = rate * (forecast.band.high / forecast.weekly_rate_kg)
  const slow = rate * (forecast.band.low / forecast.weekly_rate_kg)
  const weeksToGoal = (from.kg - goalKg) / rate
  const horizonWeeks = Math.min(MAX_FORECAST_WEEKS, (input.horizonDays ?? Infinity) / 7)
  const lastWeek = Math.min(weeksToGoal, horizonWeeks)
  const at = (w: number): ForecastPoint => ({
    date: addDays(from.date, Math.ceil(w * 7)),
    mid: round(Math.max(goalKg, from.kg - rate * w)),
    low: round(Math.max(goalKg, from.kg - fast * w)),
    high: round(Math.max(goalKg, from.kg - slow * w)),
  })
  const out: ForecastPoint[] = []
  for (let w = 0; w < lastWeek; w++) out.push(at(w))
  out.push(at(lastWeek))
  return out
}

/** The weekly loss the chart draws: anchored to finish_date when there is one (see forecastPath); null if not a loss. */
export function effectiveRate(
  from: { date: LocalDate; kg: number },
  forecast: Pick<Forecast, 'weekly_rate_kg'> & { finish_date?: LocalDate | null },
  goalKg: number,
): number | null {
  if (!(forecast.weekly_rate_kg > 0)) return null
  const days = forecast.finish_date ? daysBetween(from.date, forecast.finish_date) : 0
  return days > 0 && from.kg > goalKg ? (from.kg - goalKg) / (days / 7) : forecast.weekly_rate_kg
}

/** Date the trend reaches `kg` at `rate` kg/week from `from`: from.date + ⌈(from.kg − kg) / rate × 7⌉ days. */
export function expectedOn(kg: number, from: { date: LocalDate; kg: number } | null, rate: number | null): LocalDate | null {
  if (!from || rate === null || !(rate > 0) || kg >= from.kg) return null
  return addDays(from.date, Math.ceil(((from.kg - kg) / rate) * 7))
}

export function weightMilestones(rows: readonly MilestoneRow[]): WeightMilestone[] {
  return rows.filter((m) => m.kind === 'weight').map((m) => ({ value: m.target_value, reachedOn: m.reached_on }))
}

/** Weight milestones (heaviest first) with forecast dates for the ones still ahead; composition milestones in order. */
export function milestoneTimelines(
  rows: readonly MilestoneRow[],
  from: { date: LocalDate; kg: number } | null,
  rate: number | null,
): { weight: Milestone[]; composition: Milestone[] } {
  const weight = rows
    .filter((m) => m.kind === 'weight')
    .sort((a, b) => b.target_value - a.target_value)
    .map((m) => ({ label: m.label, reachedOn: m.reached_on, expectedOn: m.reached_on ? null : expectedOn(m.target_value, from, rate) }))
  const composition = rows.filter((m) => m.kind !== 'weight').map((m) => ({ label: shortLabel(m), reachedOn: m.reached_on }))
  return { weight, composition }
}

/** Timeline labels must fit ~55 px at phone width: "Visceral ≤ 9", "BF < 30 %", "WHR < 0.90", "Torso < 10.4 kg". */
function shortLabel(m: MilestoneRow): string {
  switch (m.kind) {
    case 'visceral_level':
      return `Visceral ≤ ${m.target_value}`
    case 'body_fat_pct':
      return `BF < ${m.target_value} %`
    case 'whr':
      return `WHR < ${m.target_value.toFixed(2)}`
    case 'segment':
      return `${m.segment === 'torso' || !m.segment ? 'Torso' : m.segment} < ${m.target_value} kg`
    default:
      return m.label
  }
}

/**
 * Trend change per Monday–Sunday week: change = trend(Sunday) − trend(the Sunday before). Only whole weeks inside
 * the series. `expected` = −weekly_rate_kg of the current forecast (a loss is negative).
 */
export function weeklyLoss(points: readonly TrendPoint[], weeklyRateKg: number | null): WeeklyLossPoint[] {
  const trend = new Map(points.filter((p) => p.trend_kg !== null).map((p) => [p.date, p.trend_kg!]))
  if (points.length === 0) return []
  const first = points[0]!.date
  const last = points.at(-1)!.date
  const out: WeeklyLossPoint[] = []
  for (let monday = weekStart(first); monday <= last; monday = addDays(monday, 7)) {
    const before = trend.get(addDays(monday, -1))
    const sunday = addDays(monday, 6)
    const after = trend.get(sunday)
    if (sunday > last || before === undefined || after === undefined) continue
    out.push({ week: monday, change: round(after - before), expected: weeklyRateKg === null ? null : round(-weeklyRateKg) })
  }
  return out
}

/** Waist at the navel per tape date, with the waist-to-hip ratio when hips were measured the same day. */
export function waistPoints(measurements: readonly Measurement[]): WaistPoint[] {
  const byDate = new Map<LocalDate, { waist?: number; hips?: number }>()
  for (const m of measurements) {
    if (m.site !== 'waist_navel' && m.site !== 'hips') continue
    const row = byDate.get(m.date) ?? {}
    if (m.site === 'waist_navel') row.waist = m.value_cm
    else row.hips = m.value_cm
    byDate.set(m.date, row)
  }
  return [...byDate.entries()]
    .filter(([, r]) => r.waist !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, r]) => ({ date, waist: r.waist!, whr: r.hips ? round(r.waist! / r.hips, 3) : null }))
}

// ── Days ───────────────────────────────────────────────────────────────────────────────────────────────────────

export function caloriesDays(days: readonly DaySummary[]): CaloriesDay[] {
  return days.map((d) => ({
    date: d.date,
    breakfast: d.kcal_by_slot.breakfast ?? null,
    lunch: d.kcal_by_slot.lunch ?? null,
    dinner: d.kcal_by_slot.dinner ?? null,
    snack: d.kcal_by_slot.snack ?? null,
    fast: d.is_fast_day,
  }))
}

export function macrosDays(days: readonly DaySummary[]): MacrosDay[] {
  return days.map((d) =>
    d.meals_logged === 0
      ? { date: d.date, protein: null, carbs: null, fat: null }
      : { date: d.date, protein: Math.round(d.intake.protein_g), carbs: Math.round(d.intake.carbs_g), fat: Math.round(d.intake.fat_g) },
  )
}

export function waterDays(days: readonly DaySummary[]): WaterDay[] {
  return days.map((d) => ({ date: d.date, ml: d.water_ml > 0 ? d.water_ml : null }))
}

export function stepsDays(days: readonly DaySummary[]): StepsDay[] {
  return days.map((d) => ({ date: d.date, steps: d.steps }))
}

/** Hours asleep (asleep_min / 60) and the Edmonton wall-clock bedtime of each night (date = wake date). */
export function sleepNights(days: readonly DaySummary[]): SleepNight[] {
  return days.map((d) => ({
    date: d.date,
    hours: d.sleep_min === null ? null : round(d.sleep_min / 60, 1),
    bedtime: d.in_bed_at ? localTime(d.in_bed_at) : null,
  }))
}

/**
 * Protein adherence: value = min(1, protein_g / target protein_g). No value (null) on a fast day, a day without
 * meals or without a target: those are not misses.
 */
export function proteinAdherence(days: readonly DaySummary[]): HeatmapDay[] {
  return days.map((d) => {
    const target = d.targets?.protein_g ?? 0
    if (d.is_fast_day || d.meals_logged === 0 || target <= 0) return { date: d.date, value: null }
    return { date: d.date, value: Math.min(1, round(d.intake.protein_g / target)) }
  })
}

/** Logging adherence score per day (engine dayAdherence: weigh-in, meals ≥ 2 or a fast, water — share of three). */
export function loggingAdherence(days: readonly DaySummary[]): HeatmapDay[] {
  return days.map((d) => ({ date: d.date, value: round(dayAdherence(d).score) }))
}

/** A fast counts as completed at ≥ 95 % of its planned length (the engine's rule, docs/PROGRESS.md). */
const FAST_COMPLETE_SHARE = 0.95
/** A planned fast past its start and not ended counts as running this long (the quick-log sheet's rule). */
const AUTO_START_WINDOW_H = 48
const HOUR_MS = 3_600_000

/**
 * One strip entry per fast, on the local date it started (the strip has no "running" mark, so a fast under way shows
 * as planned until it ends):
 *   ended                         → completed when hours ≥ 0.95 × fast_hours, else partial (hours = ended − started)
 *   not ended, start ahead        → planned
 *   not ended, ad-hoc             → planned (running)
 *   not ended, planned, < 48 h in → planned (running); later → missed
 */
export function fastEntries(fasts: readonly Fast[], nowMs: number, fastHours: number): FastEntry[] {
  return fasts
    .map((f): FastEntry => {
      const start = Date.parse(f.started_at)
      const date = localDate(f.started_at)
      if (f.ended_at) {
        const hours = round((Date.parse(f.ended_at) - start) / HOUR_MS, 1)
        return { date, status: hours >= FAST_COMPLETE_SHARE * fastHours ? 'completed' : 'partial', hours }
      }
      const running = !f.planned || nowMs - start < AUTO_START_WINDOW_H * HOUR_MS
      return { date, status: start > nowMs || running ? 'planned' : 'missed' }
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

// ── Targets and summaries ──────────────────────────────────────────────────────────────────────────────────────

/** The targets of the latest non-fast day that has them (what the chart target lines show). */
export function latestTargets(days: readonly DaySummary[]): TargetValues | null {
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i]!
    if (d.targets && !d.is_fast_day) return d.targets
  }
  return null
}

export interface RangeSummary {
  /** trend(last) − trend(first) in the range, kg. */
  trendChangeKg: number | null
  /** Mean kcal over days with at least one meal logged, fast days excluded. */
  avgKcal: number | null
  avgProteinG: number | null
  /** Days with meals logged (not fast days), the base of both averages. */
  loggedDays: number
  /** Share of days meeting all three logging checks (GLOSSARY "Adherence"). */
  adherence: number | null
  fastDays: number
}

export function rangeSummary(days: readonly DaySummary[], points: readonly TrendPoint[]): RangeSummary {
  const trends = points.filter((p) => p.trend_kg !== null)
  const logged = days.filter((d) => d.meals_logged > 0 && !d.is_fast_day)
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)
  return {
    trendChangeKg: trends.length >= 2 ? round(trends.at(-1)!.trend_kg! - trends[0]!.trend_kg!) : null,
    avgKcal: mean(logged.map((d) => d.intake.kcal)),
    avgProteinG: mean(logged.map((d) => d.intake.protein_g)),
    loggedDays: logged.length,
    adherence: days.length ? days.filter((d) => dayAdherence(d).adherent).length / days.length : null,
    fastDays: days.filter((d) => d.is_fast_day).length,
  }
}

/** Whether any value in a series is present (charts with only gaps show the empty state instead). */
export function hasAny<T>(rows: readonly T[], pick: (row: T) => number | null | undefined): boolean {
  return rows.some((r) => {
    const v = pick(r)
    return v !== null && v !== undefined && v > 0
  })
}

/** Inclusive length of a range in days. */
export function rangeDays(from: LocalDate, to: LocalDate): number {
  return daysBetween(from, to) + 1
}
