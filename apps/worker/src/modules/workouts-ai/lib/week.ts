// Owns: the training week (plan 2026-10-14-ai-runs-train-three-day-week, decisions 3 and 5, amendment A1–A3) — "plan my
// week" (move the training days first, then one user-priority workout_template job per split day, run at once while the
// invocation's fetch tally allows) and the week as Train shows it (each split day's template, pending draft and job,
// whether its last draft failed, the active week plan's sessions, and the body groups no day's template reaches yet).
// The week is the split over the settings' training days, not a week_plans row, so it repeats until the days change. A
// split day's template is the oldest of its name (engine splitTemplateFor).
import {
  BODY_GROUPS,
  missingGroups,
  splitNameKey,
  splitSlots,
  splitTemplateFor,
  today,
  weekStart,
} from '@fitness/shared/engine'
import {
  Weekday,
  WeekPlanContent,
  type JobPayload,
  type Muscle,
  type PlanWeekRequest,
  type PlanWeekResult,
  type TrainingWeek,
} from '@fitness/shared/schemas'
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { ai_jobs, exercises, settings, template_exercises, week_plans, workout_templates } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { badRequest, HttpError, notFound } from '../../../lib/http-error'
import { jobInsertUnless, runSoon } from '../../jobs'
import { hasModelKey } from '../../llm'
import { proposeTrainingDays } from '../../settings'
import { LLM_FETCHES, USER_PRIORITY } from './plan'
import { DRAFT_WINDOW_DAYS, hoursAgo, pendingSplitDrafts } from './split'

/** At most this many jobs start now (each up to LLM_FETCHES fetches in this invocation); the rest wait for the sweep. */
const RUN_NOW_MAX = 3

/** The split days a workout_template job is queued or running for (payload slot name; ai_jobs status index). */
const draftingJobs = (deps: Deps) =>
  deps.db
    .select({ name: sql<unknown>`json_extract(${ai_jobs.payload}, '$.slot.name')` })
    .from(ai_jobs)
    .where(and(inArray(ai_jobs.status, ['queued', 'running']), eq(ai_jobs.type, 'workout_template')))

/**
 * The workout_template jobs that ended (done or failed) within the drafts' window (lib/split DRAFT_WINDOW_DAYS), newest
 * first (ai_jobs status index): a failed one counts for its day's `failed` that long.
 */
const endedDraftJobs = (deps: Deps) =>
  deps.db
    .select({
      name: sql<unknown>`json_extract(${ai_jobs.payload}, '$.slot.name')`,
      status: ai_jobs.status,
      created_at: ai_jobs.created_at,
    })
    .from(ai_jobs)
    .where(
      and(
        inArray(ai_jobs.status, ['done', 'failed']),
        eq(ai_jobs.type, 'workout_template'),
        gte(ai_jobs.created_at, hoursAgo(deps, DRAFT_WINDOW_DAYS * 24)),
      ),
    )
    .orderBy(desc(ai_jobs.created_at))

const keysOf = (names: readonly unknown[]) =>
  new Set(names.flatMap((n) => (typeof n === 'string' ? [splitNameKey(n)] : [])))
const isKey = (name: unknown, key: string) => typeof name === 'string' && splitNameKey(name) === key

/**
 * A user-priority workout_template job for `payload.slot`, written only when no workout_template job is queued or
 * running for that day yet (jobs jobInsertUnless: INSERT … SELECT … WHERE NOT EXISTS, lower(trim(payload slot name)) =
 * splitNameKey(slot.name)), so a double press or the cron racing it queue one. Its result is [] when not written.
 */
function draftJobInsert(deps: Deps, payload: JobPayload<'workout_template'>) {
  const drafting = sql`${ai_jobs.type} = 'workout_template' AND ${ai_jobs.status} IN ('queued', 'running')
    AND lower(trim(json_extract(${ai_jobs.payload}, '$.slot.name'))) = ${splitNameKey(payload.slot.name)}`
  return jobInsertUnless(deps, { type: 'workout_template', payload, priority: USER_PRIORITY }, drafting)
    .statement
}

/**
 * POST /api/ai/week (and Ask AI's plan_training_week). In order:
 *   no model key in the workout_template chain           → 409 no_model_key, nothing written
 *   slots   = splitSlots(input.training_days ?? settings.training_days)   (week order; the split those days give)
 *   `only` naming no slot of it                          → 400, nothing written
 *   input.training_days → settings proposeTrainingDays (with `reason`, the AI's why): applied (user, mcp), proposed
 *             (ai) or unchanged
 *   queued  = the slots in `only` (all when absent), each a job at USER_PRIORITY, payload { slot, replace: true when a
 *             template holds its name }, inserted in one db.batch only where no workout_template job is queued or
 *             running for that name (draftJobInsert: the check is in the SQL); job_ids = the rows written
 *   skipped = the other slots' names (not in `only`, or already drafting)
 *   run now = the first min(⌊(tally.limit − tally.used) / LLM_FETCHES⌋, RUN_NOW_MAX) queued jobs (RUN_NOW_MAX without
 *             a tally), in parallel after the response; the rest wait for the 5-minute sweep
 * Each draft is the job's own (lib/split: it supersedes that day's older pending drafts), so pressing it twice leaves
 * one pending draft per day.
 */
export async function planTrainingWeek(
  deps: Deps,
  input: PlanWeekRequest & { reason?: string },
): Promise<PlanWeekResult> {
  if (!(await hasModelKey(deps, 'workout_template')))
    throw new HttpError(409, 'no_model_key', 'No AI model has a key: add a model key in Settings → AI first')
  const { db } = deps
  const [[s], templates] = await db.batch([
    db.select({ training_days: settings.training_days }).from(settings).limit(1),
    db.select({ name: workout_templates.name }).from(workout_templates),
  ])
  if (!s) throw notFound('Settings (seed the database)')
  const slots = splitSlots(input.training_days ?? s.training_days)
  const only = input.only ? new Set(input.only.map((name) => splitNameKey(name))) : null
  const unknown =
    input.only?.filter((name) => !slots.some((slot) => splitNameKey(slot.name) === splitNameKey(name))) ?? []
  if (unknown.length)
    throw badRequest(
      `Not a day of the split: ${unknown.join(', ')} (the split is ${slots.map((slot) => slot.name).join(', ') || 'empty'})`,
    )

  const days = input.training_days
    ? await proposeTrainingDays(deps, { training_days: input.training_days, reason: input.reason })
    : null
  const templated = keysOf(templates.map((t) => t.name))
  const wanted = slots.filter((slot) => !only || only.has(splitNameKey(slot.name)))
  const [first, ...rest] = wanted.map((slot) =>
    draftJobInsert(deps, templated.has(splitNameKey(slot.name)) ? { slot, replace: true } : { slot }),
  )
  const written = first ? await db.batch([first, ...rest]) : []
  const queued = wanted.flatMap((slot, i) => (written[i]?.[0] ? [{ slot, id: written[i][0].id }] : []))

  const room = deps.budget ? Math.floor((deps.budget.limit - deps.budget.used) / LLM_FETCHES) : RUN_NOW_MAX
  for (const job of queued.slice(0, Math.max(Math.min(room, RUN_NOW_MAX), 0))) runSoon(deps, job.id)
  return {
    slots,
    job_ids: queued.map((j) => j.id),
    skipped: slots.filter((slot) => !queued.some((j) => j.slot === slot)).map((slot) => slot.name),
    training_days: { status: days?.status ?? 'unchanged', proposal_id: days?.proposal_id ?? null },
  }
}

/**
 * GET /api/ai/week. One db.batch of reads, then the exercise rows of the slots' templates only. For each slot of
 * splitSlots(settings.training_days):
 *   template = the split day's template (engine splitTemplateFor: the oldest of its name): id, name, exercise count,
 *              Σ sets, muscle scores
 *   draft    = the newest pending split draft of that name (draft window), replaces_template_id = template?.id ?? null
 *   drafting = a workout_template job queued or running for that name
 *   failed   = not drafting, the newest workout_template job of that name ended in the last 28 days failed, and no
 *              pending draft of that name was written, nor its template saved, at or after that job's created_at
 * week_plan_sessions = this week's active week plan: weekday → its session's name (null = rest day), or null when
 *   there is no such plan or it has no session; uncovered = missingGroups(BODY_GROUPS, the primary muscles of every
 *   exercise of the slots' templates) (engine), so a draft still waiting for his tap does not count.
 */
export async function trainingWeek(deps: Deps): Promise<TrainingWeek> {
  const { db } = deps
  const [[s], templates, drafts, drafting, ended, plans] = await db.batch([
    db.select({ training_days: settings.training_days }).from(settings).limit(1),
    db
      .select({
        id: workout_templates.id,
        name: workout_templates.name,
        created_at: workout_templates.created_at,
        updated_at: workout_templates.updated_at,
        muscle_scores: workout_templates.muscle_scores,
      })
      .from(workout_templates)
      .orderBy(asc(workout_templates.created_at), asc(workout_templates.id)),
    pendingSplitDrafts(deps),
    draftingJobs(deps),
    endedDraftJobs(deps),
    db
      .select({ plan: week_plans.plan })
      .from(week_plans)
      .where(and(eq(week_plans.week_start, weekStart(today(deps.now()))), eq(week_plans.status, 'active')))
      .limit(1),
  ])
  if (!s) throw notFound('Settings (seed the database)')
  const busy = keysOf(drafting.map((j) => j.name))
  const split = splitSlots(s.training_days).map((slot) => ({
    slot,
    template: splitTemplateFor(templates, slot.name),
  }))
  const ids = split.flatMap((d) => (d.template ? [d.template.id] : []))
  const items = ids.length
    ? await db
        .select({
          template_id: template_exercises.template_id,
          sets: template_exercises.sets,
          primary_muscles: exercises.primary_muscles,
        })
        .from(template_exercises)
        .innerJoin(exercises, eq(exercises.id, template_exercises.exercise_id))
        .where(inArray(template_exercises.template_id, ids))
    : []
  const muscles: Muscle[] = []
  const slots = split.map(({ slot, template: t }) => {
    const key = splitNameKey(slot.name)
    const own = t ? items.filter((i) => i.template_id === t.id) : []
    muscles.push(...own.flatMap((i) => i.primary_muscles))
    const d = drafts.find((row) => isKey(row.name, key))
    const last = ended.find((job) => isKey(job.name, key))
    const after = (at: string | undefined) => !!last && !!at && at >= last.created_at
    return {
      ...slot,
      template: t
        ? {
            id: t.id,
            name: t.name,
            exercise_count: own.length,
            sets: own.reduce((n, i) => n + i.sets, 0),
            muscle_scores: t.muscle_scores ?? {},
          }
        : null,
      draft: d ? { proposal_id: d.id, replaces_template_id: t?.id ?? null } : null,
      drafting: busy.has(key),
      failed: !busy.has(key) && last?.status === 'failed' && !after(d?.created_at) && !after(t?.updated_at),
    }
  })
  const plan = plans[0] ? WeekPlanContent.safeParse(plans[0].plan) : null
  const sessions = plan?.success ? plan.data.sessions : null
  const week_plan_sessions =
    sessions && Weekday.options.some((d) => sessions[d])
      ? Object.fromEntries(Weekday.options.map((d) => [d, sessions[d]?.name ?? null]))
      : null
  return {
    training_days: s.training_days,
    slots,
    week_plan_sessions,
    uncovered: missingGroups(BODY_GROUPS, muscles),
  }
}
