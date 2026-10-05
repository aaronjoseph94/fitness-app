// Owns: the report's pure mappings — v_day rows to the chart kit's day series, muscle scores to map levels, weekly
// volume to the four muscle groups across the last reviews, the ISO-week arithmetic of the prev/next links, and the
// next week's plan as table rows. Data in, plain rows out; no React, no fetching.
import { addDays, isoWeek, isoWeekRange, localTime, muscleLevels } from '@fitness/shared/engine'
import type { DaySummary, IsoWeek, Muscle, MuscleScores, TrendPoint, WeekPlan, Weekday, WeeklyMetrics } from '@fitness/shared/schemas'
import type { CaloriesDay, MacrosDay, SleepNight, StepsDay, VolumeGroup, VolumeWeek, WaterDay, WeightPoint } from '../../../charts'

const round = (v: number, places = 1) => Math.round(v * 10 ** places) / 10 ** places

// ── Weeks ──────────────────────────────────────────────────────────────────────────────────────────────────────

const WEEK = /^\d{4}-W\d{2}$/

/** Monday and Sunday of an ISO week key, or null when the key is not a real week. */
export function weekRange(week: string | undefined): { week: IsoWeek; from: string; to: string } | null {
  if (!week || !WEEK.test(week)) return null
  try {
    return { week, ...isoWeekRange(week) }
  } catch {
    return null
  }
}

/** The ISO week `offset` weeks from the one starting on `monday`. */
export function shiftWeek(monday: string, offset: number): IsoWeek {
  return isoWeek(addDays(monday, offset * 7))
}

// ── Days ───────────────────────────────────────────────────────────────────────────────────────────────────────

export function weightPoints(points: readonly TrendPoint[]): WeightPoint[] {
  return points.map((p) => ({ date: p.date, raw: p.weight_kg, trend: p.trend_kg }))
}

export function caloriesDays(days: readonly DaySummary[]): CaloriesDay[] {
  return days.map((d) => ({ date: d.date, ...d.kcal_by_slot, fast: d.is_fast_day }))
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

/** Hours asleep and the Edmonton bedtime of each night (date = wake date). */
export function sleepNights(days: readonly DaySummary[]): SleepNight[] {
  return days.map((d) => ({
    date: d.date,
    hours: d.sleep_min === null ? null : round(d.sleep_min / 60),
    bedtime: d.in_bed_at ? localTime(d.in_bed_at) : null,
  }))
}

/** The week's targets for the dashed lines: those of its first non-fast day with targets. */
export function weekTargets(days: readonly DaySummary[]) {
  return days.find((d) => !d.is_fast_day && d.targets)?.targets ?? null
}

// ── Training ───────────────────────────────────────────────────────────────────────────────────────────────────

export function mapLevels(scores: MuscleScores) {
  return muscleLevels(scores)
}

/** The volume chart's four groups, bottom → top (the styleguide's grouping). */
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

/** Volume (kg) per group for each week, oldest first: the current week plus up to `count − 1` earlier reviewed weeks. */
export function volumeWeeks(current: WeeklyMetrics, earlier: readonly WeeklyMetrics[], count = 4): VolumeWeek[] {
  const weeks = [...earlier.filter((m) => m.week_start < current.week_start).sort((a, b) => (a.week_start < b.week_start ? -1 : 1)).slice(-(count - 1)), current]
  return weeks.map((m) => {
    const volume: Record<string, number> = {}
    for (const [muscle, kg] of Object.entries(m.volume_by_muscle) as [Muscle, number][]) {
      const g = GROUP_OF[muscle]
      volume[g] = (volume[g] ?? 0) + kg
    }
    return { week: m.week_start, volume }
  })
}

// ── Next week's plan ───────────────────────────────────────────────────────────────────────────────────────────

const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

/** The plan to show for a week: the active row, else the newest proposed one. */
export function pickWeekPlan(plans: readonly WeekPlan[] | undefined): WeekPlan | null {
  if (!plans?.length) return null
  return plans.find((p) => p.status === 'active') ?? [...plans].filter((p) => p.status === 'proposed').sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))[0] ?? null
}

export interface PlanRow {
  date: string
  weekday: Weekday
  kcal: number
  protein_g: number
  session: string | null
  fast: boolean
}

export function planRows(plan: WeekPlan): PlanRow[] {
  return WEEKDAYS.map((weekday, i) => {
    const date = addDays(plan.week_start, i)
    const t = plan.plan.targets[weekday]
    return {
      date,
      weekday,
      kcal: t.kcal,
      protein_g: t.protein_g,
      session: plan.plan.sessions[weekday]?.name ?? null,
      fast: plan.plan.fast_dates.includes(date),
    }
  })
}
