// Owns: AI workouts (SPEC §7, §9) — the workout_generate and workout_fill jobs: read the planning context, ask the
// LLM router for a session drawn only from the allowed exercise set, repair and guard it deterministically, set
// default loads from the engine's progression and muscle scores from the engine, and write one pending `workout`
// proposal (the web previews it; saving a template or starting a session with its proposal_id accepts it).
// Interface:
//   requestWorkout(deps, body)            → JobRef     POST /api/ai/workout: enqueue (user priority) + run soon
//   draftWorkout(deps, llm, input)        → WorkoutDraft (with muscle_scores, guard_notes, proposal_id)  the job body
//   planNextTrainingDay(deps, today)      → { date, job_id, reason }  nightly (after 00:30): queue workout_generate
//                                           (background) for today when it is a training day with no session, week-plan
//                                           session, pending workout proposal or queued job (yesterday's steps and
//                                           session are known by then)
// Registers the 'workout_generate' and 'workout_fill' job handlers (≤ 8 external fetches each). A job no provider could
// answer fails at once when Aaron asked for it or no provider has a key (JobFailed); otherwise the runner retries it.
import { muscleScores, today, weekdayOf, weekStart } from '@fitness/shared/engine'
import {
  WeekPlanContent,
  type AiWorkoutRequest,
  type JobRef,
  type TemplateExerciseInput,
  type WorkoutDraft,
} from '@fitness/shared/schemas'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { ai_events, ai_jobs, daily_targets, settings, week_plans, workout_sessions } from '../../db'
import type { Deps } from '../../lib/deps'
import { notFound } from '../../lib/http-error'
import { eventInsert } from '../events'
import { enqueue, JobFailed, registerJobHandler, runSoon, type JobContext } from '../jobs'
import { createLlmRouter, ProvidersExhaustedError, type LlmRouter, type Priority } from '../llm'
import { guardContext, planningContext, progressionFor } from '../training'
import { buildPrompt, dayFocus, focusFromNote, LlmWorkout, selectCandidates, SYSTEM_PROMPT, type Focus } from './lib/plan'
import { repairDraft } from './lib/repair'

export { RepairError } from './lib/repair'

/** ai_jobs.priority: Aaron's requests run before nightly drafts (the router also lets them use the whole quota). */
export const USER_PRIORITY = 10
export const BACKGROUND_PRIORITY = 0
/** External fetches one draft may make (retries and failovers included); the sweep budgets by this. */
const LLM_FETCHES = 8
/** Leave the job runner's 25 s deadline a margin for the database writes. */
const LLM_DEADLINE_MS = 22_000
/**
 * Set limits (guards: 12–28); a reduced-volume day (readiness, short sleep, fast day) caps at 16. A deload week's 60 %
 * is applied once, by the session plan (progression), never here as well.
 */
const SETS = { min: 12, max: 28, reduced_max: 16 } as const

export interface DraftInput {
  mode: 'generate' | 'fill'
  date: string
  /** generate: Aaron's free-text focus ("arms"). */
  note?: string | null
  /** fill: the partial list to complete (kept first). */
  exercises?: readonly TemplateExerciseInput[]
  priority: Priority
  job_id?: string | null
  /** The job's deadline: an attempt the runner already requeued must not store a second proposal. */
  signal?: AbortSignal
}

/** POST /api/ai/workout: queue the job at user priority and start it after the response. */
export async function requestWorkout(deps: Deps, body: AiWorkoutRequest): Promise<JobRef> {
  const date = body.date ?? today(deps.now())
  const job =
    body.mode === 'fill'
      ? await enqueue(deps, { type: 'workout_fill', payload: { date, exercises: body.exercises }, priority: USER_PRIORITY })
      : await enqueue(deps, { type: 'workout_generate', payload: { date, focus: body.focus ?? null }, priority: USER_PRIORITY })
  runSoon(deps, job.id)
  return { job_id: job.id }
}

const FOCUS_LABEL: Record<Focus, string> = { upper: 'Upper body', lower: 'Lower body', full: 'Full body' }

/**
 * Draft one workout for `input.date` and store it as a pending proposal (actor ai):
 *   focus          = from Aaron's note when he gave one (focusFromNote), else the split (dayFocus)
 *   reduced volume = readiness.reduced_volume ∨ fast day → sets 12–16 (aim 12–14), else 12–28 (aim 16–22); a deload
 *                    week is not reduced here, since the session plan applies its 60 % when the draft is started
 *   avoid          = primary muscles of the sessions the day before and after (recovery rule)
 *   loads          = engine progression load when the exercise has history, else the LLM's (0.5 kg steps), else null
 *   muscle_scores  = engine muscleScores of the final exercises
 */
export async function draftWorkout(deps: Deps, llm: Pick<LlmRouter, 'complete'>, input: DraftInput): Promise<WorkoutDraft> {
  const ai: Deps = { ...deps, actor: 'ai' }
  const { date } = input
  const [ctx, [[s], [targets]]] = await Promise.all([
    planningContext(deps, date),
    deps.db.batch([
      deps.db.select({ training_days: settings.training_days }).from(settings).limit(1),
      deps.db.select({ is_fast_day: daily_targets.is_fast_day }).from(daily_targets).where(eq(daily_targets.date, date)).limit(1),
    ]),
  ])
  if (!s) throw notFound('Settings (seed the database)')
  const { library } = ctx
  const bySlug = new Map(library.exercises.map((e) => [e.slug, e]))
  const keep = input.mode === 'fill' ? (input.exercises ?? []) : []
  const keepPrimary = keep.flatMap((k) => library.byId.get(k.exercise_id)?.primary_muscles ?? [])
  const weekday = weekdayOf(date)
  const note = input.mode === 'generate' ? input.note?.trim() : undefined
  const focus = note ? focusFromNote(note) : dayFocus(weekday, s.training_days, keepPrimary)
  const avoid = [...new Set(ctx.neighbours.flatMap((n) => n.primary_muscles))]
  const fast_day = targets?.is_fast_day ?? false
  const reduced = ctx.readiness.reduced_volume || fast_day
  const sets = { min: SETS.min, max: reduced ? SETS.reduced_max : SETS.max }

  const logged = new Set(ctx.digest.last_top_sets.keys())
  const templated = new Set(ctx.templates.flatMap((t) => t.exercises.map((e) => e.exercise_id)))
  const candidates = selectCandidates(library.exercises, focus, { logged, templated })
  const user = buildPrompt({
    mode: input.mode,
    date,
    weekday,
    focus,
    note: input.note ?? null,
    readiness: ctx.readiness,
    fast_day,
    avoid,
    sets: { ...sets, aim: reduced ? '12-14' : '16-22' },
    digest: ctx.digest,
    slugOf: (id) => library.byId.get(id)?.slug,
    templates: ctx.templates,
    equipment_notes: library.equipment.filter((e) => e.note && e.status !== 'have').map((e) => `${e.equipment}: ${e.status} (${e.note})`),
    partial: keep,
    candidates,
  })

  const reply = await llm.complete({
    job: input.mode === 'fill' ? 'workout_fill' : 'workout_generate',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: user }],
    schema: LlmWorkout,
    priority: input.priority,
    maxTokens: 1500,
  })

  const guard = await guardContext(ai, library, 'ai')
  const repaired = repairDraft({ picks: reply.data.exercises, keep, byId: library.byId, bySlug, guard, avoid, sets })
  const suggestions = await progressionFor(deps, { before: deps.now().toISOString(), exercises: repaired.exercises, deload_week: ctx.deload.active })
  const keptIds = new Set(keep.map((k) => k.exercise_id))
  const exercises = repaired.exercises.map((e) => {
    const load = suggestions.get(e.exercise_id)?.load_kg ?? null
    return keptIds.has(e.exercise_id) && e.target_load_kg !== null ? e : { ...e, target_load_kg: load ?? e.target_load_kg }
  })
  const muscle_scores = muscleScores(
    exercises.flatMap((e) => {
      const tags = library.byId.get(e.exercise_id)
      return tags ? [{ ...tags, sets: e.sets }] : []
    }),
  )
  const rationale = reply.data.rationale.trim().slice(0, 400)

  const proposal_id = crypto.randomUUID()
  const workout = { exercises, rationale, guard_notes: repaired.notes }
  const total = exercises.reduce((n, e) => n + e.sets, 0)
  input.signal?.throwIfAborted()
  await eventInsert(ai, {
    id: proposal_id,
    kind: 'proposal',
    summary: `${FOCUS_LABEL[focus]} workout for ${weekday[0]!.toUpperCase()}${weekday.slice(1)} ${date}: ${exercises.length} exercises, ${total} sets`,
    body: { kind: 'workout', mode: input.mode, date, workout, muscle_scores, provider: reply.provider, model: reply.model },
    proposal_status: 'pending',
    job_id: input.job_id ?? null,
  }).statement
  return { ...workout, muscle_scores, proposal_id }
}

/**
 * When no provider answered (and not only for daily quotas, which the runner waits out), fail the job at once rather
 * than retry for minutes: Aaron's own request has him looking at the page, and a chain where no provider has a key
 * cannot answer on any retry. The page shows the message and its way on (builder, templates).
 */
function unanswered(e: unknown, priority: Priority): JobFailed | null {
  if (!(e instanceof ProvidersExhaustedError) || e.quotaOnly) return null
  const noKeys = e.failures.length > 0 && e.failures.every((f) => f.reason === 'no_key')
  if (!noKeys && priority !== 'user') return null
  const why = noKeys ? 'no AI provider is set up (no API key)' : 'no AI provider could answer right now'
  return new JobFailed(`${why}. Build the session in the workout builder or start a template instead. ${e.message}`)
}

/** One run of a workout job: priority from the job row, a router capped at LLM_FETCHES, the draft as the output. */
async function runWorkoutJob(deps: Deps, job: JobContext<'workout_generate'> | JobContext<'workout_fill'>) {
  const [row] = await deps.db.select({ priority: ai_jobs.priority }).from(ai_jobs).where(eq(ai_jobs.id, job.id))
  const priority: Priority = (row?.priority ?? 0) > BACKGROUND_PRIORITY ? 'user' : 'background'
  const llm = createLlmRouter(deps, { budget: { limit: LLM_FETCHES, used: 0 }, deadlineMs: LLM_DEADLINE_MS })
  let provider: { provider?: string; model?: string } = {}
  const tracked: Pick<LlmRouter, 'complete'> = {
    complete: async (req) => {
      const r = await llm.complete(req)
      provider = { provider: r.provider, model: r.model }
      return r
    },
  }
  try {
    const output =
      job.type === 'workout_fill'
        ? await draftWorkout(deps, tracked, { mode: 'fill', date: job.payload.date, exercises: job.payload.exercises, priority, job_id: job.id, signal: job.signal })
        : await draftWorkout(deps, tracked, { mode: 'generate', date: job.payload.date, note: job.payload.focus, priority, job_id: job.id, signal: job.signal })
    return { output, meta: provider }
  } catch (e) {
    throw unanswered(e, priority) ?? e
  }
}

registerJobHandler('workout_generate', { fetches: LLM_FETCHES, run: runWorkoutJob })
registerJobHandler('workout_fill', { fetches: LLM_FETCHES, run: runWorkoutJob })

/**
 * Nightly hook (runs after 00:30): today gets a background workout_generate job when its daily targets plan training
 * (daily_targets.training_planned: the active week plan's sessions when it has any, else settings.training_days; the
 * settings when the date has no targets yet) and it has no session, no session in the active week plan, no pending
 * workout proposal and no queued/running job. Today, not tomorrow, so the draft's readiness sees yesterday's steps and
 * session.
 */
export async function planNextTrainingDay(deps: Deps, todayDate: string): Promise<{ date: string; job_id: string | null; reason: string }> {
  const { db } = deps
  const date = todayDate
  const [[s], [targets], sessions, plans, proposals, jobs] = await db.batch([
    db.select({ training_days: settings.training_days }).from(settings).limit(1),
    db.select({ training_planned: daily_targets.training_planned }).from(daily_targets).where(eq(daily_targets.date, date)),
    db.select({ id: workout_sessions.id }).from(workout_sessions).where(eq(workout_sessions.date, date)).limit(1),
    db
      .select({ plan: week_plans.plan })
      .from(week_plans)
      .where(and(eq(week_plans.week_start, weekStart(date)), eq(week_plans.status, 'active'))),
    db
      .select({ id: ai_events.id })
      .from(ai_events)
      .where(
        and(
          eq(ai_events.kind, 'proposal'),
          eq(ai_events.proposal_status, 'pending'),
          sql`json_extract(${ai_events.body}, '$.kind') = 'workout'`,
          sql`json_extract(${ai_events.body}, '$.date') = ${date}`,
        ),
      )
      .limit(1),
    db
      .select({ id: ai_jobs.id })
      .from(ai_jobs)
      .where(
        and(eq(ai_jobs.type, 'workout_generate'), inArray(ai_jobs.status, ['queued', 'running']), sql`json_extract(${ai_jobs.payload}, '$.date') = ${date}`),
      )
      .limit(1),
  ])
  const skip = (reason: string) => ({ date, job_id: null, reason })
  const training = targets ? targets.training_planned : (s?.training_days.includes(weekdayOf(date)) ?? false)
  if (!training) return skip('not a training day')
  if (sessions.length) return skip('a session is already logged')
  const weekPlan = plans.map((p) => WeekPlanContent.safeParse(p.plan)).find((p) => p.success)
  if (weekPlan?.data?.sessions[weekdayOf(date)]) return skip('the active week plan has a session')
  if (proposals.length) return skip('a workout proposal is already pending')
  if (jobs.length) return skip('a workout job is already queued')
  const job = await enqueue(deps, { type: 'workout_generate', payload: { date, focus: null }, priority: BACKGROUND_PRIORITY })
  return { date, job_id: job.id, reason: 'queued' }
}
