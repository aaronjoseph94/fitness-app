// Owns: what the logs say about the past — one exercise's history (per-session sets, top load and best Epley e1RM for
// the strength chart, its PRs, next session's suggestion), and the recent-training digest the AI workout jobs read.
import { addDays, e1rm, today } from '@fitness/shared/engine'
import { PersonalRecord, type ExerciseHistory, type MuscleScores } from '@fitness/shared/schemas'
import { and, asc, between, desc, eq, gte, sql } from 'drizzle-orm'
import * as z from 'zod'
import { exercises, session_sets, template_exercises, workout_sessions } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { notFound } from '../../../lib/http-error'
import { round, startPlan, toSessionSet, type SetRow } from './rows'
import { DEFAULT_REP_RANGE, deloadOn, suggestionFor, topLoad, type PastSession } from './state'

/** Sessions shown per exercise (the strength chart's whole history for a year of four sessions a week). */
const HISTORY_SESSIONS = 250

const bestE1rm = (sets: readonly SetRow[]) => {
  const values = sets.filter((s) => s.reps !== null && s.reps > 0 && s.load_kg !== null && s.load_kg > 0).map((s) => e1rm(s.load_kg!, s.reps!))
  return values.length ? round(Math.max(...values), 2) : null
}

/**
 * GET /api/history/exercises/:id: completed sets per session (newest first) with top load and best e1RM = load ×
 * (1 + reps / 30); the PRs stored on finished sessions; and the double-progression suggestion for the next session
 * (rep range from the latest session plan or template that holds the exercise, else 3 × 8–12).
 */
export async function exerciseHistory(deps: Deps, id: string): Promise<ExerciseHistory> {
  const { db } = deps
  const [[exercise], rows, prRows, [template]] = await db.batch([
    db.select({ id: exercises.id, primary_muscles: exercises.primary_muscles, equipment: exercises.equipment }).from(exercises).where(eq(exercises.id, id)),
    db
      .select({
        set: session_sets,
        date: workout_sessions.date,
        started_at: workout_sessions.started_at,
        plan: workout_sessions.plan,
        readiness: workout_sessions.readiness,
      })
      .from(session_sets)
      .innerJoin(workout_sessions, eq(workout_sessions.id, session_sets.session_id))
      .where(and(eq(session_sets.exercise_id, id), eq(session_sets.completed, true)))
      .orderBy(desc(workout_sessions.started_at), asc(session_sets.set_index)),
    db
      .select({ prs: workout_sessions.prs })
      .from(workout_sessions)
      .where(sql`${workout_sessions.prs} is not null and instr(${workout_sessions.prs}, ${id}) > 0`),
    db
      .select({ sets: template_exercises.sets, rep_min: template_exercises.rep_min, rep_max: template_exercises.rep_max })
      .from(template_exercises)
      .where(eq(template_exercises.exercise_id, id))
      .orderBy(desc(template_exercises.updated_at))
      .limit(1),
  ])
  if (!exercise) throw notFound('Exercise')

  const sessions: (PastSession & { plan: unknown; readiness: unknown })[] = []
  for (const r of rows) {
    let s = sessions.at(-1)
    if (s?.session_id !== r.set.session_id) {
      if (sessions.length >= HISTORY_SESSIONS) break
      s = { session_id: r.set.session_id, date: r.date, started_at: r.started_at, plan: r.plan, readiness: r.readiness, sets: [] }
      sessions.push(s)
    }
    s.sets.push(r.set)
  }

  const prs = prRows
    .flatMap((r) => {
      const parsed = z.array(PersonalRecord).safeParse(r.prs)
      return parsed.success ? parsed.data : []
    })
    .filter((p) => p.exercise_id === id)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  const planned = sessions.map((s) => startPlan(s)?.exercises.find((p) => p.exercise_id === id)).find((p) => p !== undefined)
  const range = planned ?? template ?? DEFAULT_REP_RANGE
  const deload = await deloadOn(deps, today(deps.now()))
  const next = sessions.length ? suggestionFor(exercise, range, sessions, deload.active) : null

  return {
    exercise_id: id,
    entries: sessions.map((s) => ({
      session_id: s.session_id,
      date: s.date,
      sets: s.sets.map(toSessionSet),
      top_load_kg: topLoad(s.sets),
      best_e1rm_kg: bestE1rm(s.sets),
    })),
    prs,
    next,
  }
}

// ── Digest for the AI workout jobs ─────────────────────────────────────────────────────────────────────────────

export interface SessionDigest {
  date: string
  origin: string
  sets_done: number
  volume_kg: number
  /** Stored on finish (muscle score per muscle); null while a session is open. */
  muscle_scores: MuscleScores | null
  prs: { exercise_id: string; kind: string; reps: number; load_kg: number }[]
}

export interface TrainingDigest {
  sessions: SessionDigest[]
  /** Per exercise: the latest completed top set (heaviest load, its reps) on or after `from`. */
  last_top_sets: Map<string, { date: string; load_kg: number; reps: number }>
}

/** Sessions on [from, to] and the latest top set per exercise since `since` (for the AI prompt; compact). */
export async function trainingDigest(deps: Deps, range: { from: string; to: string; since: string }): Promise<TrainingDigest> {
  const { db } = deps
  const [rows, sets, tops] = await db.batch([
    db.select().from(workout_sessions).where(between(workout_sessions.date, range.from, range.to)).orderBy(asc(workout_sessions.started_at)),
    db
      .select({
        session_id: session_sets.session_id,
        n: sql<number>`count(*)`,
        volume: sql<number>`coalesce(sum(${session_sets.reps} * ${session_sets.load_kg}), 0)`,
      })
      .from(session_sets)
      .innerJoin(workout_sessions, eq(workout_sessions.id, session_sets.session_id))
      .where(and(between(workout_sessions.date, range.from, range.to), eq(session_sets.completed, true)))
      .groupBy(session_sets.session_id),
    db
      .select({ exercise_id: session_sets.exercise_id, date: workout_sessions.date, load_kg: session_sets.load_kg, reps: session_sets.reps })
      .from(session_sets)
      .innerJoin(workout_sessions, eq(workout_sessions.id, session_sets.session_id))
      .where(and(gte(workout_sessions.date, range.since), eq(session_sets.completed, true)))
      .orderBy(desc(workout_sessions.started_at), desc(session_sets.load_kg))
      .limit(2000),
  ])
  const last_top_sets = new Map<string, { date: string; load_kg: number; reps: number }>()
  for (const t of tops) {
    if (last_top_sets.has(t.exercise_id) || t.load_kg === null || t.reps === null) continue
    last_top_sets.set(t.exercise_id, { date: t.date, load_kg: t.load_kg, reps: t.reps })
  }
  return {
    sessions: rows.map((r) => {
      const agg = sets.find((s) => s.session_id === r.id)
      const prs = z.array(PersonalRecord).safeParse(r.prs)
      return {
        date: r.date,
        origin: r.origin,
        sets_done: Number(agg?.n ?? 0),
        volume_kg: round(Number(agg?.volume ?? 0), 1),
        muscle_scores: r.muscle_scores ?? null,
        prs: prs.success ? prs.data.map((p) => ({ exercise_id: p.exercise_id, kind: p.kind, reps: p.reps, load_kg: p.load_kg })) : [],
      }
    }),
    last_top_sets,
  }
}

/** The default "since" for top sets: eight weeks before `date`. */
export const topSetsSince = (date: string) => addDays(date, -56)

