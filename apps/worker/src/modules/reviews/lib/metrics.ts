// Owns: the weekly review's metrics — one Monday–Sunday rolled up by the engine from v_day (via the day module, with
// the trend), the week's finished sessions (volume and muscle scores by engine sessionSummary, PRs stored on the
// sessions), its fasts, the active forecast, safety flags as of Sunday and the scan deltas when a scan fell in the week.
import {
  addDays,
  compareScans,
  isoWeek,
  localDate,
  safetyFlags,
  sessionSummary,
  weeklyMetrics,
  type ScanLike,
} from '@fitness/shared/engine'
import {
  PersonalRecord,
  ScanSegment,
  type DaySummary,
  type ReviewFlag,
  type ReviewPr,
  type ReviewScanDelta,
  type WeeklyMetrics,
} from '@fitness/shared/schemas'
import { and, between, count, desc, eq, inArray, isNotNull, lte } from 'drizzle-orm'
import * as z from 'zod'
import { daily_targets, exercises, scan_segments, scans, session_sets, workout_sessions, type Row } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { days } from '../../day'
import { listFasts } from '../../fasting'
import { getActivePlan } from '../../plan'
import { getSettings } from '../../settings'

/** Days of v_day read before the week: the safety flags look back 22 days from Sunday (rapid loss: 3 weeks + 1 day). */
const FLAG_LOOKBACK_DAYS = 22

const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp
const roundOrNull = (x: number | null, dp: number) => (x === null ? null : round(x, dp))
const roundValues = <K extends string>(r: Partial<Record<K, number>>, dp: number) =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, round(v as number, dp)])) as Partial<Record<K, number>>

const StoredPrs = z.array(PersonalRecord)

/**
 * The week week_start … week_start + 6 (week_start must be a Monday). Engine weeklyMetrics over v_day rows
 * (week_start − 22 … Sunday, so the trend start and the flags have history), plus:
 *   target_kcal_avg / target_protein_g = mean target over the week's non-fast days with targets
 *   sessions_planned = |daily_targets in the week with training_planned|
 *   muscle_scores, volume_by_muscle, volume_kg = engine sessionSummary over the completed sets of sessions that ended
 *   prs = the PRs stored on those sessions (with exercise names)
 *   flags = safetyFlags(as_of Sunday) + the lean-loss guard of a scan in the week
 *   scan = compareScans(previous confirmed scan, the week's last confirmed scan)
 */
export async function buildWeeklyMetrics(deps: Deps, week_start: string): Promise<WeeklyMetrics> {
  const week_end = addDays(week_start, 6)
  // days() first: it materialises any missing daily_targets, which the planned-sessions count reads.
  const series = await days(deps, { from: addDays(week_end, -FLAG_LOOKBACK_DAYS), to: week_end })
  const [settingsView, plan, fastRows, training, scan] = await Promise.all([
    getSettings(deps),
    getActivePlan(deps),
    listFasts(deps, { from: week_start, to: week_end }),
    loadTraining(deps, week_start, week_end),
    loadScanDelta(deps, week_start, week_end),
  ])
  const now = deps.now().toISOString()
  // A fast belongs to the week it started in; a planned fast counts once it has begun.
  const fasts = fastRows.filter((f) => {
    const start = localDate(f.started_at)
    return f.started_at <= now && start >= week_start && start <= week_end
  })
  const base = weeklyMetrics({
    week_start,
    days: series,
    sessions_planned: training.planned,
    fasts,
    fast_hours: settingsView.settings.fast_hours,
    now,
  })
  const week = series.filter((d) => d.date >= week_start && d.date <= week_end)
  const targeted = week.filter((d): d is DaySummary & { targets: NonNullable<DaySummary['targets']> } => !d.is_fast_day && d.targets !== null)
  const meanOf = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

  const flags: ReviewFlag[] = safetyFlags({ as_of: week_end, days: series }).map((f) => ({ kind: f.kind, message: f.message }))
  if (scan?.lean_loss === 'lean_loss') {
    const share = scan.lean_share_of_loss === null ? '' : ` (${Math.round(scan.lean_share_of_loss * 100)} % of the loss)`
    flags.push({ kind: 'lean_loss', message: `Lean mass made up more than 25 % of the weight lost since the last scan${share}` })
  }

  return {
    week: isoWeek(week_start),
    week_start,
    trend_start_kg: roundOrNull(base.trend_start_kg, 2),
    trend_end_kg: roundOrNull(base.trend_end_kg, 2),
    trend_change_kg: roundOrNull(base.trend_change_kg, 2),
    intake_avg: base.intake_avg,
    target_kcal_avg: roundOrNull(meanOf(targeted.map((d) => d.targets.kcal)), 0),
    target_protein_g: roundOrNull(meanOf(targeted.map((d) => d.targets.protein_g)), 1),
    days_logged: base.days_logged,
    protein_adherence: round(base.protein_adherence, 3),
    water_avg_ml: base.water_avg_ml,
    steps_avg: base.steps_avg,
    sleep_avg_min: base.sleep_avg_min,
    sessions_done: base.sessions_done,
    sessions_planned: base.sessions_planned,
    muscle_scores: training.muscle_scores,
    volume_by_muscle: training.volume_by_muscle,
    volume_kg: training.volume_kg,
    prs: training.prs,
    fasts: base.fasts,
    logging_adherence: round(base.logging_adherence, 3),
    forecast: plan.forecast,
    flags,
    scan,
  }
}

// ── Training ───────────────────────────────────────────────────────────────────────────────────────────────────

async function loadTraining(deps: Deps, from: string, to: string) {
  const { db } = deps
  const [planned, sessionRows, setRows] = await db.batch([
    db
      .select({ n: count() })
      .from(daily_targets)
      .where(and(between(daily_targets.date, from, to), eq(daily_targets.training_planned, true))),
    db
      .select({ id: workout_sessions.id, prs: workout_sessions.prs })
      .from(workout_sessions)
      .where(and(between(workout_sessions.date, from, to), isNotNull(workout_sessions.ended_at))),
    db
      .select({
        exercise_id: session_sets.exercise_id,
        reps: session_sets.reps,
        load_kg: session_sets.load_kg,
        completed: session_sets.completed,
        name: exercises.name,
        primary_muscles: exercises.primary_muscles,
        secondary_muscles: exercises.secondary_muscles,
      })
      .from(session_sets)
      .innerJoin(workout_sessions, eq(workout_sessions.id, session_sets.session_id))
      .innerJoin(exercises, eq(exercises.id, session_sets.exercise_id))
      .where(and(between(workout_sessions.date, from, to), isNotNull(workout_sessions.ended_at), eq(session_sets.completed, true))),
  ])

  const tags = new Map(setRows.map((s) => [s.exercise_id, { id: s.exercise_id, primary_muscles: s.primary_muscles, secondary_muscles: s.secondary_muscles }]))
  const names = new Map(setRows.map((s) => [s.exercise_id, s.name]))
  // One summary over the whole week: muscle scores and volume are sums over sets, so this equals Σ per session.
  const summary = sessionSummary({ date: from, started_at: from, ended_at: from, sets: setRows, exercises: [...tags.values()], history: [] })

  const prs: ReviewPr[] = sessionRows.flatMap((s) => {
    const parsed = StoredPrs.safeParse(s.prs ?? [])
    return parsed.success ? parsed.data.map((p) => ({ ...p, exercise_name: names.get(p.exercise_id) ?? 'Exercise' })) : []
  })
  return {
    planned: planned[0]?.n ?? 0,
    muscle_scores: roundValues(summary.muscle_scores, 1),
    volume_by_muscle: roundValues(summary.volume_by_muscle, 0),
    volume_kg: round(summary.total_volume_kg, 0),
    prs,
  }
}

// ── Scans ──────────────────────────────────────────────────────────────────────────────────────────────────────

type ScanRow = Row<typeof scans>
type SegmentRow = Row<typeof scan_segments>

function scanLike(row: ScanRow, segments: readonly SegmentRow[]): ScanLike | null {
  const { weight_kg, lean_body_mass_kg, body_fat_mass_kg, total_body_water_kg } = row
  if (weight_kg === null || lean_body_mass_kg === null || body_fat_mass_kg === null || total_body_water_kg === null) return null
  return {
    ...row,
    weight_kg,
    lean_body_mass_kg,
    body_fat_mass_kg,
    total_body_water_kg,
    segments: Object.fromEntries(segments.filter((s) => s.scan_id === row.id).map((s) => [s.segment, { lean_kg: s.lean_kg, fat_kg: s.fat_kg }])),
  }
}

const fromTo = (a: number | null, b: number | null) => (a === null || b === null ? null : { from: a, to: b })

/** The week's last confirmed scan against the confirmed scan before it; null when no scan fell in the week. */
async function loadScanDelta(deps: Deps, from: string, to: string): Promise<ReviewScanDelta | null> {
  const { db } = deps
  const [latest, previous] = await db
    .select()
    .from(scans)
    .where(and(eq(scans.confirmed, true), lte(scans.date, to)))
    .orderBy(desc(scans.scanned_at))
    .limit(2)
  if (!latest || !previous || latest.date < from) return null
  const segments = await db.select().from(scan_segments).where(inArray(scan_segments.scan_id, [latest.id, previous.id]))
  const a = scanLike(previous, segments)
  const b = scanLike(latest, segments)
  if (!a || !b) return null
  const c = compareScans(a, b)
  const r2 = (x: number) => round(x, 2)
  return {
    scan_id: latest.id,
    date: latest.date,
    previous_scan_id: previous.id,
    previous_date: previous.date,
    days: c.days,
    fat_vs_lean: {
      weight_kg: r2(c.fat_vs_lean.weight_kg),
      fat_kg: r2(c.fat_vs_lean.fat_kg),
      lean_kg: r2(c.fat_vs_lean.lean_kg),
      water_kg: r2(c.fat_vs_lean.water_kg),
    },
    body_fat_pct: fromTo(previous.body_fat_pct, latest.body_fat_pct),
    visceral_fat_level: fromTo(previous.visceral_fat_level, latest.visceral_fat_level),
    lean_share_of_loss: roundOrNull(c.lean_share_of_loss, 3),
    lean_loss: c.lean_loss,
    segments: ScanSegment.options.flatMap((segment) => {
      const before = a.segments?.[segment]
      const after = b.segments?.[segment]
      return before && after
        ? [{ segment, fat_from: before.fat_kg, fat_to: after.fat_kg, lean_from: before.lean_kg, lean_to: after.lean_kg }]
        : []
    }),
    milestones_reached: c.milestones_reached.map((m) => m.label),
  }
}
