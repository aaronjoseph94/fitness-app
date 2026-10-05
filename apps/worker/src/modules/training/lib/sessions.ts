// Owns: workout sessions — start (from a template, a week-plan snapshot, an AI draft, or blank) with readiness, and
// the plan snapshot, the recovery rule and the deload check stored as the start plan (workout_sessions.plan); the session view with each planned exercise's last
// sets and progression default; set logging with client ids; finish (engine sessionSummary + an ai_events note), which
// re-runs after an edit; and delete (the session, its sets and that note).
import { DELOAD_SETS_FACTOR, localDate, sessionSummary, weekdayOf, weekStart, type SessionTotals } from '@fitness/shared/engine'
import {
  WeekPlanContent,
  type DeloadStatus,
  type Muscle,
  type SessionCreate,
  type SessionFinish,
  type SessionFinishResult,
  type SessionPlanExercise,
  type SessionSet,
  type SetCreate,
  type SetPatch,
  type TemplateExerciseInput,
  type WorkoutSession,
} from '@fitness/shared/schemas'
import { and, between, desc, eq, gt, inArray, lt, max } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { ai_events, session_sets, week_plans, workout_sessions, workout_templates } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { badRequest, HttpError, notFound } from '../../../lib/http-error'
import { eventInsert } from '../../events'
import { acceptStatement, loadWorkoutProposal } from './guard'
import { exclusionReason, exerciseTags, loadRules, requireExercises } from './library'
import { bySetOrder, chunk, round, startPlan, startReadiness, toSessionSet, toWorkoutSession, unique, type ExerciseTags, type SessionRow, type StartPlan } from './rows'
import { DEFAULT_REP_RANGE, deloadOn, neighbourSessions, pastSessions, readinessOn, recoveryFor, suggestionFor, topLoad } from './state'
import { checkExercises, scoresOf, templatePlan } from './templates'

/** Start of the recovery note for a planned exercise left out of a session (the logger shows these notes). */
const LEFT_OUT = 'Left out '

async function sessionRow(deps: Deps, id: string): Promise<SessionRow | null> {
  const [row] = await deps.db.select().from(workout_sessions).where(eq(workout_sessions.id, id))
  return row ?? null
}

/** The active week plan's session for `date`'s weekday, as a plan snapshot (null when none). */
async function weekPlanSession(deps: Deps, date: string): Promise<{ template_id: string | null; exercises: TemplateExerciseInput[] } | null> {
  const [row] = await deps.db
    .select({ plan: week_plans.plan })
    .from(week_plans)
    .where(and(eq(week_plans.week_start, weekStart(date)), eq(week_plans.status, 'active')))
  const plan = row ? WeekPlanContent.safeParse(row.plan) : null
  return plan?.success ? (plan.data.sessions[weekdayOf(date)] ?? null) : null
}

/**
 * POST /api/sessions. The plan is `exercises` when given, else the template's, else the proposal's draft, else the
 * active week plan's session (origin week_plan); blank has none. Replaying the same id returns the stored session.
 * `exercises` from ai/mcp must pass the workout guards (422, as for templates). Any other plan is never refused: its
 * exercises outside the allowed set are left out, each with a recovery note starting LEFT_OUT.
 */
export async function startSession(deps: Deps, input: SessionCreate): Promise<WorkoutSession> {
  if (await sessionRow(deps, input.id)) return getSession(deps, input.id)
  const date = localDate(input.started_at)
  const proposal = input.proposal_id ? await loadWorkoutProposal(deps, input.proposal_id) : null

  let template_id = input.template_id
  let plan: TemplateExerciseInput[] = []
  if (template_id) {
    const fromTemplate = await templatePlan(deps, template_id)
    if (!fromTemplate) throw notFound('Template')
    plan = fromTemplate
  }
  if (input.exercises) plan = input.exercises
  else if (!template_id && proposal) plan = proposal.body.workout.exercises
  else if (!template_id && input.origin === 'week_plan') {
    const planned = await weekPlanSession(deps, date)
    plan = planned?.exercises ?? []
    if (planned?.template_id && (await deps.db.select({ id: workout_templates.id }).from(workout_templates).where(eq(workout_templates.id, planned.template_id))).length)
      template_id = planned.template_id
  }
  // An explicit list from ai/mcp passes the workout guards (allowed set, 12–28 sets), as a template would. Any other
  // plan (Aaron's list, a template, a draft, the week plan) is never refused, since the session is his log: exercises
  // outside the allowed set now (equipment marked since, hidden since) are left out of it, each with a note.
  const guarded = !!input.exercises && deps.actor !== 'user'
  const tags = guarded ? await checkExercises(deps, plan) : await requireExercises(deps, plan.map((p) => p.exercise_id))
  const leftOut: string[] = []
  if (!guarded && plan.length) {
    const rules = await loadRules(deps)
    plan = plan.filter((p) => {
      const reason = exclusionReason(tags.get(p.exercise_id)!, rules)
      if (reason) leftOut.push(`${LEFT_OUT}${tags.get(p.exercise_id)!.name}: ${reason}`)
      return reason === null
    })
  }

  const [readiness, deload, neighbours] = await Promise.all([readinessOn(deps, date), deloadOn(deps, date), neighbourSessions(deps, date)])
  const primaries = unique(plan.flatMap((p) => tags.get(p.exercise_id)?.primary_muscles ?? []))
  const recovery = recoveryFor(date, primaries, neighbours, readiness)
  const start: StartPlan = { exercises: plan, recovery: { ...recovery, notes: [...recovery.notes, ...leftOut] }, deload }
  const now = deps.now().toISOString()
  const statements: BatchItem<'sqlite'>[] = [
    deps.db
      .insert(workout_sessions)
      .values({
        id: input.id,
        date,
        template_id,
        started_at: input.started_at,
        ended_at: null,
        origin: input.origin,
        readiness,
        plan: start,
        notes: null,
        muscle_scores: plan.length ? scoresOf(plan, tags) : null,
        prs: null,
        actor: deps.actor,
        created_at: now,
        updated_at: now,
      })
      .onConflictDoNothing(),
  ]
  if (proposal) statements.push(acceptStatement(deps, proposal.id))
  await deps.db.batch([statements[0]!, ...statements.slice(1)])
  return getSession(deps, input.id)
}

/** GET /api/sessions/:id: the session, its sets, and the plan with last sets and progression defaults. */
export async function getSession(deps: Deps, id: string): Promise<WorkoutSession> {
  const [[row], sets] = await deps.db.batch([
    deps.db.select().from(workout_sessions).where(eq(workout_sessions.id, id)),
    deps.db.select().from(session_sets).where(eq(session_sets.session_id, id)),
  ])
  if (!row) throw notFound('Session')
  const start = startPlan(row)
  const planned = start?.exercises ?? []
  const extra = unique([...sets].sort(bySetOrder).map((s) => s.exercise_id)).filter((x) => !planned.some((p) => p.exercise_id === x))
  const entries: TemplateExerciseInput[] = [
    ...planned,
    ...extra.map((exercise_id) => ({
      exercise_id,
      sets: Math.max(1, sets.filter((s) => s.exercise_id === exercise_id).length),
      rep_min: DEFAULT_REP_RANGE.rep_min,
      rep_max: DEFAULT_REP_RANGE.rep_max,
      target_load_kg: null,
      rest_sec: DEFAULT_REP_RANGE.rest_sec,
      note: null,
    })),
  ]
  const ids = entries.map((e) => e.exercise_id)
  const [tags, past] = await Promise.all([exerciseTags(deps, ids), pastSessions(deps, ids, row.started_at)])
  const deload: DeloadStatus = start?.deload ?? { due: false, reason: null, weeks_since: 0, sets_factor: DELOAD_SETS_FACTOR, active: false }
  const plan = entries.flatMap((e): SessionPlanExercise[] => {
    const t = tags.get(e.exercise_id)
    if (!t) return []
    const history = past.get(e.exercise_id) ?? []
    const last = history[0] ?? null
    const suggestion = suggestionFor(t, e, history, deload.active)
    return [
      {
        ...e,
        default_load_kg: suggestion.load_kg ?? e.target_load_kg ?? (last ? topLoad(last.sets) : null),
        last: last
          ? { session_id: last.session_id, date: last.date, sets: last.sets.map((s) => ({ set_index: s.set_index, reps: s.reps, load_kg: s.load_kg, rpe: s.rpe })) }
          : null,
        suggestion,
      },
    ]
  })
  return {
    ...toWorkoutSession(row, sets),
    plan,
    recovery: start?.recovery ?? { conflicts: [], reduced_volume: startReadiness(row)?.reduced_volume ?? false, notes: [] },
    deload,
  }
}

/** GET /api/sessions?from&to: sessions on those local dates, newest first, with their sets (no plan). */
export async function listSessions(deps: Deps, range: { from: string; to: string }): Promise<WorkoutSession[]> {
  const [rows, sets] = await deps.db.batch([
    deps.db.select().from(workout_sessions).where(between(workout_sessions.date, range.from, range.to)).orderBy(desc(workout_sessions.started_at)),
    deps.db
      .select({ set: session_sets })
      .from(session_sets)
      .innerJoin(workout_sessions, eq(workout_sessions.id, session_sets.session_id))
      .where(between(workout_sessions.date, range.from, range.to)),
  ])
  return rows.map((r) =>
    toWorkoutSession(
      r,
      sets.filter((s) => s.set.session_id === r.id).map((s) => s.set),
    ),
  )
}

/**
 * DELETE /api/sessions/:id: the session, its sets and its finish note (the 'note' event whose id is the session's), as
 * one db.batch (no ON DELETE CASCADE). Idempotent: an unknown or deleted id is a no-op, as for the other queued deletes.
 * A workout proposal the session accepted stays accepted.
 */
export async function deleteSession(deps: Deps, id: string): Promise<{ ok: true }> {
  const { db } = deps
  await db.batch([
    db.delete(session_sets).where(eq(session_sets.session_id, id)),
    db.delete(ai_events).where(and(eq(ai_events.id, id), eq(ai_events.kind, 'note'))),
    db.delete(workout_sessions).where(eq(workout_sessions.id, id)),
  ])
  return { ok: true }
}

// ── Sets ───────────────────────────────────────────────────────────────────────────────────────────────────────

async function setById(deps: Deps, id: string) {
  const [row] = await deps.db.select().from(session_sets).where(eq(session_sets.id, id))
  return row ?? null
}

/** POST /api/sessions/:id/sets. The client id makes a replay return the stored set (409 if it belongs elsewhere). */
export async function logSet(deps: Deps, session_id: string, input: SetCreate): Promise<SessionSet> {
  if (!(await sessionRow(deps, session_id))) throw notFound('Session')
  await requireExercises(deps, [input.exercise_id])
  const now = deps.now().toISOString()
  await deps.db
    .insert(session_sets)
    .values({
      id: input.id,
      session_id,
      exercise_id: input.exercise_id,
      set_index: input.set_index,
      reps: input.reps ?? null,
      load_kg: input.load_kg ?? null,
      rpe: input.rpe ?? null,
      completed: input.completed,
      note: input.note ?? null,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoNothing()
  const row = await setById(deps, input.id)
  if (!row || row.session_id !== session_id) throw new HttpError(409, 'set_conflict', 'This set id belongs to another session')
  return toSessionSet(row)
}

/** PATCH /api/sets/:id; null clears a value. */
export async function updateSet(deps: Deps, id: string, patch: SetPatch): Promise<SessionSet> {
  const set = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
  const [row] = await deps.db
    .update(session_sets)
    .set({ ...set, updated_at: deps.now().toISOString() })
    .where(eq(session_sets.id, id))
    .returning()
  if (!row) throw notFound('Set')
  return toSessionSet(row)
}

/** DELETE /api/sets/:id (idempotent). */
export async function deleteSet(deps: Deps, id: string): Promise<{ ok: true }> {
  await deps.db.delete(session_sets).where(eq(session_sets.id, id))
  return { ok: true }
}

// ── Finish ─────────────────────────────────────────────────────────────────────────────────────────────────────

const kg = (n: number) => `${Math.round(n).toLocaleString('en-CA')} kg`

function finishText(summary: SessionTotals, names: ReadonlyMap<string, ExerciseTags>): string {
  const prs = summary.prs.filter((p) => p.kind === 'best_e1rm')
  const prText = prs.length
    ? `; PR${prs.length > 1 ? 's' : ''}: ${prs.map((p) => `${names.get(p.exercise_id)?.name ?? 'exercise'} ${p.load_kg} kg × ${p.reps}`).join(', ')}`
    : ''
  return `Session finished: ${summary.duration_min} min, ${kg(summary.total_volume_kg)} volume${prText}`
}

const roundScores = (s: Partial<Record<Muscle, number>>) =>
  Object.fromEntries(Object.entries(s).map(([m, v]) => [m, round(v ?? 0, 2)])) as Partial<Record<Muscle, number>>

/**
 * POST /api/sessions/:id/finish: engine sessionSummary over the completed sets against every earlier session's
 * completed sets of the same exercises (duration, total volume, volume per muscle, PRs by e1RM and best load at
 * reps, muscle scores), stored on the session, plus one ai_events note (id = the session id, so a replay adds none).
 * Finishing again (after editing a finished session's sets, with the same ended_at) recomputes all of it and rewrites
 * the note.
 */
export async function finishSession(deps: Deps, id: string, input: SessionFinish): Promise<SessionFinishResult> {
  const [[row], sets] = await deps.db.batch([
    deps.db.select().from(workout_sessions).where(eq(workout_sessions.id, id)),
    deps.db.select().from(session_sets).where(eq(session_sets.session_id, id)),
  ])
  if (!row) throw notFound('Session')
  if (input.ended_at < row.started_at) throw badRequest('ended_at must not be before started_at')
  const ids = unique(sets.map((s) => s.exercise_id))
  const [tags, history] = await Promise.all([exerciseTags(deps, ids), historySets(deps, ids, row.started_at)])
  const totals = sessionSummary({
    date: row.date,
    started_at: row.started_at,
    ended_at: input.ended_at,
    sets,
    exercises: [...tags.values()],
    history,
  })
  const summary = {
    ...totals,
    total_volume_kg: round(totals.total_volume_kg, 2),
    volume_by_muscle: roundScores(totals.volume_by_muscle),
    muscle_scores: roundScores(totals.muscle_scores),
    prs: totals.prs.map((p) => ({ ...p, e1rm_kg: round(p.e1rm_kg, 2), previous_best_kg: p.previous_best_kg === null ? null : round(p.previous_best_kg, 2) })),
  }
  const now = deps.now().toISOString()
  const text = finishText(summary, tags)
  const body = { text, session_id: id, summary }
  const note = eventInsert(deps, { id, kind: 'note', summary: text, body, date: row.date })
  await deps.db.batch([
    deps.db
      .update(workout_sessions)
      .set({
        ended_at: input.ended_at,
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        muscle_scores: summary.muscle_scores,
        prs: summary.prs,
        updated_at: now,
      })
      .where(eq(workout_sessions.id, id)),
    // A re-finish (after editing the sets) rewrites the note's numbers; a replay writes the same ones.
    note.statement.onConflictDoUpdate({ target: ai_events.id, set: { summary: text, body, updated_at: now } }),
  ])
  return { session: await getSession(deps, id), summary }
}

/**
 * The best completed load per (exercise, reps) of `ids` in sessions started before `before`: all PR detection reads
 * (best load at ≥ r reps; e1RM rises with load at fixed reps, so its max is among these rows), in at most one row per
 * rep count per exercise however long the history grows.
 */
async function historySets(deps: Deps, ids: readonly string[], before: string) {
  const out: { exercise_id: string; reps: number | null; load_kg: number | null; completed: boolean }[] = []
  for (const part of chunk(ids, 90)) {
    const rows = await deps.db
      .select({ exercise_id: session_sets.exercise_id, reps: session_sets.reps, load_kg: max(session_sets.load_kg) })
      .from(session_sets)
      .innerJoin(workout_sessions, eq(workout_sessions.id, session_sets.session_id))
      .where(
        and(
          inArray(session_sets.exercise_id, part),
          lt(workout_sessions.started_at, before),
          eq(session_sets.completed, true),
          gt(session_sets.reps, 0),
          gt(session_sets.load_kg, 0),
        ),
      )
      .groupBy(session_sets.exercise_id, session_sets.reps)
    for (const r of rows) out.push({ ...r, completed: true })
  }
  return out
}
