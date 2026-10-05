// Owns: Aaron's training state on a date, read from the logs and decided by the engine — readiness (last night's
// sleep, yesterday's steps vs the 14-day median, days since the last session), the recovery rule against the day
// before and after, the deload check, and per-exercise history with the double-progression suggestion.
import {
  addDays,
  daysBetween,
  DELOAD_SETS_FACTOR,
  deloadCheck,
  nextProgression,
  readiness,
  recoveryConflicts,
  type Progression,
} from '@fitness/shared/engine'
import type { DeloadStatus, Muscle, Readiness, SessionRecovery } from '@fitness/shared/schemas'
import { and, asc, between, desc, eq, inArray, lt, lte, min, ne } from 'drizzle-orm'
import { exercises, session_sets, sleep_logs, step_logs, workout_sessions } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { chunk, startPlan, unique, type ExerciseTags, type SetRow } from './rows'

/** Rep minimum assumed for a logged set whose session stored no plan (SPEC §7 default range 8–12). */
export const DEFAULT_REP_RANGE = { rep_min: 8, rep_max: 12, sets: 3, rest_sec: 90 } as const
/** Days of sessions the deload check reads (≥ 8 weeks, so a 6-week block and a break both show). */
const DELOAD_WINDOW_DAYS = 70
/** A gap of this many days between sessions counts as a deload (a week off is at least as restful). */
const BREAK_DAYS = 8
/** Earlier sessions per exercise kept for the progression rule and the greyed defaults. */
const PAST_SESSIONS_PER_EXERCISE = 6
/** Cap on history rows read at once. */
const PAST_SET_LIMIT = 3000

const NONE = '00000000-0000-0000-0000-000000000000'

// ── Readiness ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Readiness for a session on `date` (engine readiness; sleep = the night ending on `date`). */
export async function readinessOn(deps: Deps, date: string, exclude: string = NONE): Promise<Readiness> {
  const { db } = deps
  const [sleep, steps, last] = await db.batch([
    db.select().from(sleep_logs).where(eq(sleep_logs.date, date)).limit(1),
    db
      .select({ date: step_logs.date, steps: step_logs.steps })
      .from(step_logs)
      .where(between(step_logs.date, addDays(date, -15), addDays(date, -1))),
    db
      .select({ date: workout_sessions.date })
      .from(workout_sessions)
      .where(and(lte(workout_sessions.date, date), ne(workout_sessions.id, exclude)))
      .orderBy(desc(workout_sessions.date))
      .limit(1),
  ])
  const night = sleep[0]
  const sleep_min =
    night?.asleep_min ??
    (night?.in_bed_at && night.woke_at ? Math.max(0, (Date.parse(night.woke_at) - Date.parse(night.in_bed_at)) / 60_000) : null)
  const yesterday = addDays(date, -1)
  return readiness({
    sleep_min,
    steps_yesterday: steps.find((s) => s.date === yesterday)?.steps ?? null,
    steps_prior_14d: steps.filter((s) => s.date !== yesterday).map((s) => s.steps),
    days_since_last_session: last[0] ? daysBetween(last[0].date, date) : null,
  })
}

// ── Recovery ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Primary muscles of the sessions on the day before and after `date`: muscles of completed sets, or of the session's
 * plan when nothing is completed yet.
 */
export async function neighbourSessions(
  deps: Deps,
  date: string,
  exclude: string = NONE,
): Promise<{ date: string; primary_muscles: Muscle[] }[]> {
  const { db } = deps
  const days = [addDays(date, -1), addDays(date, 1)]
  const [sessions, done] = await db.batch([
    db
      .select({ id: workout_sessions.id, date: workout_sessions.date, plan: workout_sessions.plan, readiness: workout_sessions.readiness })
      .from(workout_sessions)
      .where(and(inArray(workout_sessions.date, days), ne(workout_sessions.id, exclude))),
    db
      .select({ session_id: session_sets.session_id, primary: exercises.primary_muscles })
      .from(session_sets)
      .innerJoin(workout_sessions, eq(workout_sessions.id, session_sets.session_id))
      .innerJoin(exercises, eq(exercises.id, session_sets.exercise_id))
      .where(and(inArray(workout_sessions.date, days), eq(session_sets.completed, true))),
  ])
  const planIds = unique(sessions.flatMap((s) => (done.some((d) => d.session_id === s.id) ? [] : (startPlan(s)?.exercises ?? []).map((p) => p.exercise_id))))
  const planTags = planIds.length ? await primariesOf(deps, planIds) : new Map<string, Muscle[]>()
  return sessions.map((s) => {
    const logged = done.filter((d) => d.session_id === s.id).flatMap((d) => d.primary)
    const planned = (startPlan(s)?.exercises ?? []).flatMap((p) => planTags.get(p.exercise_id) ?? [])
    return { date: s.date, primary_muscles: unique(logged.length ? logged : planned) }
  })
}

async function primariesOf(deps: Deps, ids: readonly string[]): Promise<Map<string, Muscle[]>> {
  const out = new Map<string, Muscle[]>()
  for (const part of chunk(ids, 90)) {
    const rows = await deps.db.select({ id: exercises.id, p: exercises.primary_muscles }).from(exercises).where(inArray(exercises.id, part))
    for (const r of rows) out.set(r.id, r.p)
  }
  return out
}

/** The recovery rule (SPEC §7) for a plan on `date`, with readable notes. */
export function recoveryFor(
  date: string,
  planned_primary: readonly Muscle[],
  neighbours: readonly { date: string; primary_muscles: readonly Muscle[] }[],
  r: Readiness,
): SessionRecovery {
  const conflicts = recoveryConflicts({ date, planned_primary, sessions: neighbours })
  const notes: string[] = []
  for (const n of neighbours) {
    const hit = conflicts.filter((m) => n.primary_muscles.includes(m))
    if (hit.length) notes.push(`${hit.join(', ')} ${hit.length > 1 ? 'are' : 'is'} also a primary target ${n.date < date ? 'the day before' : 'the day after'}`)
  }
  if (r.sleep_h !== null && r.sleep_h < 5) notes.push(`Under 5 h sleep last night (${r.sleep_h} h): reduced volume suggested`)
  else if (r.reduced_volume) notes.push(`Readiness ${r.score}/100: reduced volume suggested`)
  return { conflicts, reduced_volume: r.reduced_volume, notes }
}

// ── Deload ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Deload status for a session on `date` (engine deloadCheck, SPEC §7). The last deload is the later of
 *   - the first day of the latest run of sessions started in a deload week (start plan deload.active), and
 *   - the day after the last session before a gap of ≥ 8 days (a week off counts as a deload);
 * training started on the first session ever. active = inside a deload week (≤ 6 days after its first session), or due.
 */
export async function deloadOn(deps: Deps, date: string, exclude: string = NONE): Promise<DeloadStatus> {
  const { db } = deps
  const from = addDays(date, -DELOAD_WINDOW_DAYS)
  const [rows, firstRows] = await db.batch([
    db
      .select({ id: workout_sessions.id, date: workout_sessions.date, plan: workout_sessions.plan, readiness: workout_sessions.readiness })
      .from(workout_sessions)
      .where(and(between(workout_sessions.date, from, date), ne(workout_sessions.id, exclude)))
      .orderBy(asc(workout_sessions.date), asc(workout_sessions.started_at)),
    db
      .select({ first: min(workout_sessions.date) })
      .from(workout_sessions)
      .where(ne(workout_sessions.id, exclude)),
  ])
  const first = firstRows[0]?.first ?? null
  const flagged = rows.filter((r) => startPlan(r)?.deload?.active)
  const lastFlag = flagged.at(-1)
  const deloadStart = lastFlag ? flagged.find((r) => daysBetween(r.date, lastFlag.date) <= 6)!.date : null
  if (deloadStart && daysBetween(deloadStart, date) <= 6)
    return { due: false, reason: null, weeks_since: 0, sets_factor: DELOAD_SETS_FACTOR, active: true }

  const dates = unique([...(first !== null && first < from ? [from] : []), ...rows.map((r) => r.date)])
  let breakStart: string | null = null
  for (let i = 1; i <= dates.length; i++) {
    const next = dates[i] ?? date
    if (daysBetween(dates[i - 1]!, next) >= BREAK_DAYS) breakStart = addDays(dates[i - 1]!, 1)
  }
  const last_deload_on = [deloadStart, breakStart].filter((d): d is string => d !== null).sort().at(-1) ?? null

  const recent = rows.slice(-4)
  const sets = recent.length
    ? await db
        .select({ session_id: session_sets.session_id, exercise_id: session_sets.exercise_id, reps: session_sets.reps, completed: session_sets.completed })
        .from(session_sets)
        .where(inArray(session_sets.session_id, recent.map((r) => r.id)))
    : []
  const check = deloadCheck({
    as_of: date,
    last_deload_on,
    training_started_on: first ?? date,
    recent_sessions: recent.map((r) => {
      const plan = startPlan(r)?.exercises ?? []
      return {
        date: r.date,
        sets: sets
          .filter((s) => s.session_id === r.id)
          .map((s) => ({
            reps: s.reps,
            completed: s.completed,
            rep_min: plan.find((p) => p.exercise_id === s.exercise_id)?.rep_min ?? DEFAULT_REP_RANGE.rep_min,
          })),
      }
    }),
  })
  return { ...check, active: check.due }
}

// ── History and progression ────────────────────────────────────────────────────────────────────────────────────

/** One earlier session of one exercise: its completed sets in order. */
export type PastSession = { session_id: string; date: string; started_at: string; sets: SetRow[] }

/**
 * Completed sets of `ids` in sessions started before `before` (UTC instant), per exercise, newest session first; at
 * most `per` sessions per exercise.
 */
export async function pastSessions(
  deps: Deps,
  ids: readonly string[],
  before: string,
  per: number = PAST_SESSIONS_PER_EXERCISE,
): Promise<Map<string, PastSession[]>> {
  const out = new Map<string, PastSession[]>()
  for (const part of chunk(unique(ids), 90)) {
    const rows = await deps.db
      .select({ set: session_sets, date: workout_sessions.date, started_at: workout_sessions.started_at })
      .from(session_sets)
      .innerJoin(workout_sessions, eq(workout_sessions.id, session_sets.session_id))
      .where(and(inArray(session_sets.exercise_id, part), lt(workout_sessions.started_at, before), eq(session_sets.completed, true)))
      .orderBy(desc(workout_sessions.started_at), asc(session_sets.set_index))
      .limit(PAST_SET_LIMIT)
    for (const r of rows) {
      const list = out.get(r.set.exercise_id) ?? []
      let entry = list.find((p) => p.session_id === r.set.session_id)
      if (!entry) {
        if (list.length >= per) continue
        entry = { session_id: r.set.session_id, date: r.date, started_at: r.started_at, sets: [] }
        list.push(entry)
        out.set(r.set.exercise_id, list)
      }
      entry.sets.push(r.set)
    }
  }
  return out
}

/** The engine's double-progression suggestion for one planned exercise (SPEC §7). */
export function suggestionFor(
  tags: Pick<ExerciseTags, 'primary_muscles' | 'equipment'>,
  plan: { sets: number; rep_min: number; rep_max: number },
  past: readonly PastSession[],
  deload_week: boolean,
): Progression {
  return nextProgression({
    exercise: { primary_muscles: tags.primary_muscles, equipment: tags.equipment },
    rep_min: plan.rep_min,
    rep_max: plan.rep_max,
    sets: plan.sets,
    history: past.map((p) => ({ date: p.date, sets: p.sets })),
    deload_week,
  })
}

/** Top load over completed sets with reps (null when none). */
export function topLoad(sets: readonly SetRow[]): number | null {
  const loads = sets.filter((s) => s.reps !== null && s.reps > 0 && s.load_kg !== null).map((s) => s.load_kg!)
  return loads.length ? Math.max(...loads) : null
}
