// Owns: the report's pure mappings — the day and weight series (Progress's own, re-exported), muscle scores to map
// levels, weekly volume to the four muscle groups across the last reviews (in real kg), the ISO-week arithmetic of the
// prev/next links, and the next week's plan as table rows. Data in, plain rows out; no React, no fetching.
import { addDays, isoWeek, isoWeekRange, muscleLevels } from '@fitness/shared/engine'
import type { DaySummary, IsoWeek, MuscleScores, WeekPlan, Weekday, WeeklyMetrics } from '@fitness/shared/schemas'
import type { VolumeWeek } from '../../../charts'
import { groupVolume, VOLUME_GROUPS } from '../../progress/series'

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

// The day and weight series are Progress's own mappings (SPEC §11 puts these charts on both), so both draw the same.
export { caloriesDays, macrosDays, sleepNights, stepsDays, waterDays, weightPoints } from '../../progress/series'

/** The week's targets for the dashed lines: those of its first non-fast day with targets. */
export function weekTargets(days: readonly DaySummary[]) {
  return days.find((d) => !d.is_fast_day && d.targets)?.targets ?? null
}

// ── Training ───────────────────────────────────────────────────────────────────────────────────────────────────

export function mapLevels(scores: MuscleScores) {
  return muscleLevels(scores)
}

export { VOLUME_GROUPS }

/**
 * Real kg per group for each week, oldest first: the current week plus up to `count − 1` earlier reviewed weeks. The
 * weighted volume_by_muscle is scaled to the week's volume_kg (groupVolume), so the stacks match "X kg lifted".
 */
export function volumeWeeks(current: WeeklyMetrics, earlier: readonly WeeklyMetrics[], count = 4): VolumeWeek[] {
  const weeks = [...earlier.filter((m) => m.week_start < current.week_start).sort((a, b) => (a.week_start < b.week_start ? -1 : 1)).slice(-(count - 1)), current]
  return weeks.map((m) => ({ week: m.week_start, volume: groupVolume(m.volume_by_muscle, m.volume_kg) }))
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
