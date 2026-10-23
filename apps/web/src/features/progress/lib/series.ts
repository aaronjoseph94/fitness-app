// Owns: the pure mapping from API data (TrendSeries, DaySummary rows, fasts, the forecast, sessions) to the chart kit's
// plain series, plus the small aggregates the Progress summary shows. The weekly report reuses the day, weight and
// volume mappings through ./series. No React, no fetching: data in, series out.
import {
  addDays,
  dayAdherence,
  daysBetween,
  fastDay,
  localDate,
  localTime,
  projectedOn,
  sessionSummary,
  weekStart,
  type MuscleValues,
  type ProjectionInput,
} from '@fitness/shared/engine'
import type {
  DaySummary,
  ExerciseSummary,
  Fast,
  Forecast,
  LocalDate,
  Measurement,
  Milestone as MilestoneRow,
  Muscle,
  TargetValues,
  TrendPoint,
  WorkoutSession,
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
  VolumeGroup,
  VolumeWeek,
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
 * The forecast drawn from the last trend point, one point a week, at the one weekly rate every page shows
 * (forecastRate) and ending on the projected summit (engine `projectedOn(goal)`, the forecast's finish date), or at
 * `horizonDays`, whichever comes first. Empty when the rate is not a loss. The mid line is the line every projected
 * date sits on, so a camp's date read off the chart is the date the milestones show:
 *   rate    = weekly_rate_kg                                          (forecastRate)
 *   end     = projectedOn(goal)                                       (else from.date + ⌈(trend − goal) / rate × 7⌉ days)
 *   mid(d)  = min(trend, goal + rate × (end − d) / 7)
 *   low(w)  = max(goal, trend − band.high × w)                        (SPEC §9: band = rate × (1 ∓ 0.20))
 *   high(w) = max(goal, trend − band.low × w)
 */
export function forecastPath(input: {
  from: { date: LocalDate; kg: number }
  forecast: Pick<Forecast, 'weekly_rate_kg' | 'band'> & { finish_date?: LocalDate | null }
  goalKg: number
  horizonDays?: number
}): ForecastPoint[] {
  const { from, forecast, goalKg } = input
  const rate = forecastRate(forecast)
  if (rate === null || from.kg <= goalKg) return []
  const projected = projectedOn(goalKg, {
    forecast: { weekly_rate_kg: rate, finish_date: forecast.finish_date ?? null },
    goal_kg: goalKg,
    trend: from,
  })
  const end =
    projected && projected > from.date
      ? projected
      : addDays(from.date, Math.ceil(((from.kg - goalKg) / rate) * 7))
  const horizonDays = Math.min(MAX_FORECAST_WEEKS * 7, input.horizonDays ?? Infinity)
  const lastDay = Math.min(daysBetween(from.date, end), horizonDays)
  const at = (days: number): ForecastPoint => {
    const w = days / 7
    const date = addDays(from.date, Math.ceil(days))
    return {
      date,
      mid: round(Math.min(from.kg, goalKg + (rate * daysBetween(date, end)) / 7)),
      low: round(Math.max(goalKg, from.kg - forecast.band.high * w)),
      high: round(Math.max(goalKg, from.kg - forecast.band.low * w)),
    }
  }
  const out: ForecastPoint[] = []
  for (let d = 0; d < lastDay; d += 7) out.push(at(d))
  out.push(at(lastDay))
  return out
}

/**
 * When the ± band reaches the goal (SPEC §9: band = rate × (1 ∓ 0.20)):
 *   early = from.date + ⌈(from.kg − goal) / band.high × 7⌉ days
 *   late  = from.date + ⌈(from.kg − goal) / band.low × 7⌉ days
 * Null when the rate is not a loss or the trend is already at the goal.
 */
export function forecastBandDates(
  from: { date: LocalDate; kg: number },
  forecast: Pick<Forecast, 'weekly_rate_kg' | 'band'>,
  goalKg: number,
): { early: LocalDate; late: LocalDate } | null {
  if (forecastRate(forecast) === null) return null
  const early = expectedOn(goalKg, from, forecast.band.high)
  const late = expectedOn(goalKg, from, forecast.band.low)
  return early && late ? { early, late } : null
}

/**
 * The forecast band's half-width as a share of its rate, in whole percent (SPEC §9: ±20 %):
 *   round((band.high − band.low) / 2 / weekly_rate_kg × 100)
 * Null unless the rate is a loss.
 */
export function forecastBandPercent(
  forecast: Pick<Forecast, 'weekly_rate_kg' | 'band'> | null | undefined,
): number | null {
  return forecast && forecast.weekly_rate_kg > 0
    ? Math.round(((forecast.band.high - forecast.band.low) / 2 / forecast.weekly_rate_kg) * 100)
    : null
}

/** Date the trend reaches `kg` at `rate` kg/week from `from`:from.date + ⌈(from.kg − kg) / rate × 7⌉ days. */
export function expectedOn(
  kg: number,
  from: { date: LocalDate; kg: number } | null,
  rate: number | null,
): LocalDate | null {
  if (!from || rate === null || !(rate > 0) || kg >= from.kg) return null
  return addDays(from.date, Math.ceil(((from.kg - kg) / rate) * 7))
}

export function weightMilestones(rows: readonly MilestoneRow[]): WeightMilestone[] {
  return rows
    .filter((m) => m.kind === 'weight')
    .map((m) => ({ value: m.target_value, reachedOn: m.reached_on }))
}

/**
 * The one weekly rate every page shows (Today's next camp, the Dashboard, Progress, the weekly report): the forecast's
 * weekly_rate_kg = (tdee_est − planned intake) × 7 / 7,700, with tdee_est re-estimated from the last 14 days of trend
 * (SPEC §9). Null unless it is a loss. Observed changes are shown as kg over a named window, never as kg a week.
 */
export function forecastRate(forecast: Pick<Forecast, 'weekly_rate_kg'> | null | undefined): number | null {
  return forecast && forecast.weekly_rate_kg > 0 ? forecast.weekly_rate_kg : null
}

/** The engine's projection input from a trend series: its forecast, the goal and the last trend weight. */
export function projectionOf(
  trend: { points: readonly TrendPoint[]; forecast: Forecast | null } | null | undefined,
  goalKg: number,
): ProjectionInput {
  return { forecast: trend?.forecast ?? null, goal_kg: goalKg, trend: trend ? lastTrend(trend.points) : null }
}

/**
 * Weight milestones (heaviest first) with their projected dates (engine `projectedOn`: on the forecast's line, so the
 * goal lands on finish_date) for the ones still ahead; composition milestones in order.
 */
export function milestoneTimelines(
  rows: readonly MilestoneRow[],
  projection: ProjectionInput,
): { weight: Milestone[]; composition: Milestone[] } {
  const weight = rows
    .filter((m) => m.kind === 'weight')
    .sort((a, b) => b.target_value - a.target_value)
    .map((m) => ({
      label: m.label,
      reachedOn: m.reached_on,
      expectedOn: m.reached_on ? null : projectedOn(m.target_value, projection),
    }))
  const composition = compositionOrder(rows).map((m) => ({ label: shortLabel(m), reachedOn: m.reached_on }))
  return { weight, composition }
}

export interface MilestoneItem {
  label: string
  /**
   * `done` reached · `next` the next weight milestone (a camp) · `later` a weight camp further on, or a composition
   * milestone not reached yet.
   */
  state: 'done' | 'next' | 'later'
  reachedOn: LocalDate | null
  /** Projected date of a weight milestone not reached yet (engine `projectedOn`). */
  expectedOn: LocalDate | null
  /** Trend kg still to lose to the next weight milestone: from.kg − target. */
  awayKg: number | null
  /** What measures it: the trend weight, an Evolt scan, or the tape (waist-to-hip). */
  source: 'weight' | 'scan' | 'tape'
  /** A weight milestone's target, kg (null for a composition milestone). */
  kg: number | null
}

/**
 * The Progress milestones list (1d "Camps on the way"): every weight milestone, heaviest first — the ones reached, the
 * next one with the kilograms still to go, and the ones further on with their projected dates (engine `projectedOn`) —
 * then every composition milestone in its own order.
 */
export function milestoneList(rows: readonly MilestoneRow[], projection: ProjectionInput): MilestoneItem[] {
  const from = projection.trend
  const weight = rows.filter((m) => m.kind === 'weight').sort((a, b) => b.target_value - a.target_value)
  const next = weight.find((m) => !m.reached_on)
  const items: MilestoneItem[] = weight.map((m) => ({
    label: m.label,
    state: m.reached_on ? 'done' : m === next ? 'next' : 'later',
    reachedOn: m.reached_on,
    expectedOn: m.reached_on ? null : projectedOn(m.target_value, projection),
    awayKg: m === next && from ? round(from.kg - m.target_value, 1) : null,
    source: 'weight',
    kg: m.target_value,
  }))
  for (const m of compositionOrder(rows)) {
    items.push({
      label: shortLabel(m),
      state: m.reached_on ? 'done' : 'later',
      reachedOn: m.reached_on,
      expectedOn: null,
      awayKg: null,
      source: m.kind === 'whr' ? 'tape' : 'scan',
      kg: null,
    })
  }
  return items
}

/**
 * The plan's base line from base camp to the summit: start weight on the start date to goal weight on the goal date,
 * and its rate in kg a week = (start − goal) / (days from start to goal ÷ 7). Null without a goal below the start or a
 * goal date after the start. (The chart draws it as the dashed gold plan line; pace against the plan is
 * `paceVersusPlan`, from today, not this line's slope.)
 */
export function basePlan(
  profile: {
    start_date: LocalDate
    start_weight_kg: number
    goal_weight_kg: number
    goal_date: LocalDate
  } | null,
): { from: { date: LocalDate; kg: number }; to: { date: LocalDate; kg: number }; rate: number } | null {
  if (!profile) return null
  const days = daysBetween(profile.start_date, profile.goal_date)
  const kg = profile.start_weight_kg - profile.goal_weight_kg
  if (!(days > 0) || !(kg > 0)) return null
  return {
    from: { date: profile.start_date, kg: profile.start_weight_kg },
    to: { date: profile.goal_date, kg: profile.goal_weight_kg },
    rate: kg / (days / 7),
  }
}

/** Where the trend's pace stands against the goal date. Rates are kg lost per week. */
export interface Pace {
  /** The weekly loss the goal date still needs from today; null at or under the goal, or with no goal date ahead. */
  requiredRate: number | null
  /** The forecast's own weekly loss; null unless it is a loss. */
  forecastRate: number | null
  /** Whether the forecast lands the goal by its date; null when either rate is missing. */
  ahead: boolean | null
}

/**
 * Pace versus plan — "ahead" means the forecast reaches the goal by the goal date:
 *   required = (now − goal) / (days from today to goal_date ÷ 7)   (null unless now > goal and goal_date > today)
 *   forecast = weekly_rate_kg                                       (null unless > 0)
 *   ahead    = forecast ≥ required                                  (null when either is null)
 * The Dashboard's trend card and "Against the plan" rail and Progress's hero all read it, so they never disagree.
 */
export function paceVersusPlan(input: {
  nowKg: number | null
  goalKg: number | null
  today: LocalDate
  goalDate: LocalDate | null
  weeklyRateKg: number | null | undefined
}): Pace {
  const { nowKg, goalKg, goalDate, weeklyRateKg } = input
  const weeksLeft = goalDate ? daysBetween(input.today, goalDate) / 7 : 0
  const requiredRate =
    nowKg !== null && goalKg !== null && weeksLeft > 0 && nowKg > goalKg ? (nowKg - goalKg) / weeksLeft : null
  const forecastRate = typeof weeklyRateKg === 'number' && weeklyRateKg > 0 ? weeklyRateKg : null
  return {
    requiredRate,
    forecastRate,
    ahead: requiredRate !== null && forecastRate !== null ? forecastRate >= requiredRate : null,
  }
}

/**
 * Composition milestones in the order they come: each kind where it first appears, and within a kind (all "under"
 * thresholds: body fat %, visceral level, WHR, a segment's fat) the highest target first — BF < 30 % before 25 % before
 * 20 %, so "next" is the one closest to where he is.
 */
function compositionOrder(rows: readonly MilestoneRow[]): MilestoneRow[] {
  const kinds = [
    ...new Set(rows.filter((m) => m.kind !== 'weight').map((m) => `${m.kind}:${m.segment ?? ''}`)),
  ]
  return kinds.flatMap((k) =>
    rows.filter((m) => `${m.kind}:${m.segment ?? ''}` === k).sort((a, b) => b.target_value - a.target_value),
  )
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
    out.push({
      week: monday,
      change: round(after - before),
      expected: weeklyRateKg === null ? null : round(-weeklyRateKg),
    })
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
      : {
          date: d.date,
          protein: Math.round(d.intake.protein_g),
          carbs: Math.round(d.intake.carbs_g),
          fat: Math.round(d.intake.fat_g),
        },
  )
}

export function waterDays(days: readonly DaySummary[]): WaterDay[] {
  return days.map((d) => ({ date: d.date, ml: d.water_ml > 0 ? d.water_ml : null }))
}

export function stepsDays(days: readonly DaySummary[]): StepsDay[] {
  return days.map((d) => ({ date: d.date, steps: d.steps }))
}

/** SPEC §9 readiness compares sleep with 7.5 h. */
export const SLEEP_TARGET_H = 7.5

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
/** A fast not ended counts as under way for 2 × fast_hours after its start (quick-log's rule); later it was missed. */
const RUNNING_WINDOW_FASTS = 2
const HOUR_MS = 3_600_000

/**
 * One strip entry per fast, on its fast day (the engine's `fastDay`: the local date holding most of its window, as
 * Log, Today, the Dashboard, the week plan and `is_fast_day` date it — Saturday for a 24 h fast from Friday 8 PM), or on
 * its start date when it has none (broken off early). The strip has no "running" mark, so a fast under way shows as
 * planned until it ends:
 *   ended                         → completed when hours ≥ 0.95 × fast_hours, else partial (hours = ended − started)
 *   not ended, start ahead        → planned
 *   not ended, < 2 × fast_hours in → planned (running), planned or ad-hoc; later → missed (never ended)
 */
export function fastEntries(fasts: readonly Fast[], nowMs: number, fastHours: number): FastEntry[] {
  return fasts
    .map((f): FastEntry => {
      const start = Date.parse(f.started_at)
      const date = fastDay(f, fastHours) ?? localDate(f.started_at)
      if (f.ended_at) {
        const hours = round((Date.parse(f.ended_at) - start) / HOUR_MS, 1)
        return { date, status: hours >= FAST_COMPLETE_SHARE * fastHours ? 'completed' : 'partial', hours }
      }
      const running = nowMs - start < RUNNING_WINDOW_FASTS * fastHours * HOUR_MS
      return { date, status: start > nowMs || running ? 'planned' : 'missed' }
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

// ── Training ───────────────────────────────────────────────────────────────────────────────────────────────────

/** The volume chart's four groups, bottom → top (the chart's own stacking order). */
export const VOLUME_GROUPS: readonly VolumeGroup[] = [
  { key: 'legs', label: 'Legs' },
  { key: 'pull', label: 'Back & biceps' },
  { key: 'push', label: 'Chest, shoulders & triceps' },
  { key: 'core', label: 'Core' },
]

const GROUP_OF: Readonly<Record<Muscle, string>> = {
  quadriceps: 'legs',
  hamstrings: 'legs',
  glutes: 'legs',
  calves: 'legs',
  adductors: 'legs',
  abductors: 'legs',
  lats: 'pull',
  'middle back': 'pull',
  'lower back': 'pull',
  traps: 'pull',
  biceps: 'pull',
  forearms: 'pull',
  neck: 'pull',
  chest: 'push',
  shoulders: 'push',
  triceps: 'push',
  abdominals: 'core',
}

/**
 * Real kilograms lifted per group. The engine's volume_by_muscle weights each lift 1.0 per primary and 0.5 per
 * secondary muscle, so it sums to 2–3× the kg lifted; it is scaled back to the week's tonnage:
 *   k = volume_kg / Σ volume_by_muscle,   group(g) = k × Σ_{muscle ∈ g} volume_by_muscle[muscle]
 * so the groups add up to volume_kg (Σ reps × kg, "sets × reps × kg"), in whole kg by largest remainder (their sum is
 * round(volume_kg)). Exact because both come from one sessionSummary.
 */
export function groupVolume(volumeByMuscle: MuscleValues, volumeKg: number): Record<string, number> {
  const weighted = Object.values(volumeByMuscle).reduce((sum, v) => sum + (v ?? 0), 0)
  const k = weighted > 0 ? volumeKg / weighted : 0
  const out: Record<string, number> = {}
  for (const [muscle, kg] of Object.entries(volumeByMuscle) as [Muscle, number][]) {
    const g = GROUP_OF[muscle]
    out[g] = (out[g] ?? 0) + kg * k
  }
  // Whole kg by largest remainder, so the groups add up to round(volume_kg) exactly — the weekly bars' total and the
  // volume map's "X kg" never differ by a rounding kilogram.
  const keys = Object.keys(out)
  const floors = Object.fromEntries(keys.map((g) => [g, Math.floor(out[g]!)]))
  let left =
    Math.round(keys.reduce((sum, g) => sum + out[g]!, 0)) - keys.reduce((sum, g) => sum + floors[g]!, 0)
  for (const g of [...keys].sort((a, b) => out[b]! - floors[b]! - (out[a]! - floors[a]!))) {
    if (left <= 0) break
    floors[g]! += 1
    left--
  }
  return floors
}

type ExerciseTags = Pick<ExerciseSummary, 'id' | 'primary_muscles' | 'secondary_muscles'>

/** The engine's volume numbers over the completed sets of the sessions dated `from` … `to` (inclusive). */
export function volumeBetween(
  sessions: readonly WorkoutSession[],
  exercises: readonly ExerciseTags[],
  from: LocalDate,
  to: LocalDate,
): { volume_kg: number; volume_by_muscle: MuscleValues } {
  const sets = sessions.filter((s) => s.date >= from && s.date <= to).flatMap((s) => s.sets)
  const t = sessionSummary({ date: to, started_at: from, ended_at: from, sets, exercises, history: [] })
  return { volume_kg: t.total_volume_kg, volume_by_muscle: t.volume_by_muscle }
}

/**
 * Volume per group for every Monday–Sunday week touching `from` … `to`, oldest first, from the first week with a lift
 * (weeks before it — before base camp, or before training started — would only be empty labelled columns).
 */
export function sessionVolumeWeeks(
  sessions: readonly WorkoutSession[],
  exercises: readonly ExerciseTags[],
  from: LocalDate,
  to: LocalDate,
): VolumeWeek[] {
  const weeks: VolumeWeek[] = []
  for (let monday = weekStart(from); monday <= to; monday = addDays(monday, 7)) {
    const v = volumeBetween(sessions, exercises, monday, addDays(monday, 6))
    weeks.push({ week: monday, volume: groupVolume(v.volume_by_muscle, v.volume_kg) })
  }
  const first = weeks.findIndex((w) => Object.values(w.volume).some((kg) => kg > 0))
  return first === -1 ? weeks : weeks.slice(first)
}

/** Sessions per exercise with a completed loaded set, most first (the strength chart's picker order). */
export function exercisesByUse(
  sessions: readonly WorkoutSession[],
): { exercise_id: string; sessions: number }[] {
  const count = new Map<string, number>()
  for (const s of sessions) {
    const ids = new Set(
      s.sets.filter((x) => x.completed && x.load_kg !== null && x.load_kg > 0).map((x) => x.exercise_id),
    )
    for (const id of ids) count.set(id, (count.get(id) ?? 0) + 1)
  }
  return [...count]
    .map(([exercise_id, n]) => ({ exercise_id, sessions: n }))
    .sort((a, b) => b.sessions - a.sessions)
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
  /** The first and last trend weight in the range, kg, and the days between their dates. */
  trendFromKg: number | null
  trendToKg: number | null
  trendDays: number
  /** Mean kcal over days with at least one meal logged, fast days excluded. */
  avgKcal: number | null
  avgProteinG: number | null
  /** Days with meals logged (not fast days), the base of both averages. */
  loggedDays: number
  /** Logged days (as above) with protein at or above that day's target. */
  proteinHitDays: number
  /** Share of days meeting all three logging checks (GLOSSARY "Adherence"). */
  adherence: number | null
  /** Days meeting all three checks, out of `days`. */
  adherentDays: number
  days: number
  /** Days with anything logged: a weigh-in, a meal, water or a fast day. */
  daysWithData: number
  fastDays: number
}

export function rangeSummary(days: readonly DaySummary[], points: readonly TrendPoint[]): RangeSummary {
  const trends = points.filter((p) => p.trend_kg !== null)
  const first = trends[0]
  const last = trends.at(-1)
  const logged = days.filter((d) => d.meals_logged > 0 && !d.is_fast_day)
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)
  const adherentDays = days.filter((d) => dayAdherence(d).adherent).length
  return {
    trendChangeKg: trends.length >= 2 ? round(last!.trend_kg! - first!.trend_kg!) : null,
    trendFromKg: first?.trend_kg ?? null,
    trendToKg: last?.trend_kg ?? null,
    trendDays: first && last ? daysBetween(first.date, last.date) : 0,
    avgKcal: mean(logged.map((d) => d.intake.kcal)),
    avgProteinG: mean(logged.map((d) => d.intake.protein_g)),
    loggedDays: logged.length,
    proteinHitDays: logged.filter(
      (d) => d.targets !== null && d.targets.protein_g > 0 && d.intake.protein_g >= d.targets.protein_g,
    ).length,
    adherence: days.length ? adherentDays / days.length : null,
    adherentDays,
    days: days.length,
    daysWithData: days.filter(
      (d) => d.weight_kg !== null || d.meals_logged > 0 || d.water_ml > 0 || d.is_fast_day,
    ).length,
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
