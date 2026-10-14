// Owns: the training week (plan 2026-10-14-ai-runs-train-three-day-week, decisions 3 and 5, amendment A1–A3) — "plan my
// week" (move the training days first, then one user-priority workout_template job per split day, run at once while the
// invocation's fetch tally allows) and the week as Train shows it (each split day's template, pending draft and job, the
// active week plan's sessions, and the body groups no day's template reaches yet). The week is the split over the
// settings' training days, not a week_plans row, so it repeats until the days change.
import { BODY_GROUPS, missingGroups, splitNameKey, splitSlots, today, weekStart } from '@fitness/shared/engine'
import { Weekday, WeekPlanContent, type Muscle, type PlanWeekRequest, type PlanWeekResult, type TrainingWeek } from '@fitness/shared/schemas'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { ai_jobs, exercises, settings, template_exercises, week_plans, workout_templates } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { badRequest, HttpError, notFound } from '../../../lib/http-error'
import { jobInsert, runSoon } from '../../jobs'
import { hasModelKey } from '../../llm'
import { proposeTrainingDays } from '../../settings'
import { LLM_FETCHES, USER_PRIORITY } from './plan'
import { pendingSplitDrafts } from './split'

/** Jobs started now when the invocation has no fetch tally to size them by (a caller without deps.budget). */
const RUN_NOW_WITHOUT_TALLY = 3

/** The split days a workout_template job is queued or running for (payload slot name; ai_jobs status index). */
const draftingJobs = (deps: Deps) =>
  deps.db
    .select({ name: sql<unknown>`json_extract(${ai_jobs.payload}, '$.slot.name')` })
    .from(ai_jobs)
    .where(and(inArray(ai_jobs.status, ['queued', 'running']), eq(ai_jobs.type, 'workout_template')))

const keysOf = (names: readonly unknown[]) => new Set(names.flatMap((n) => (typeof n === 'string' ? [splitNameKey(n)] : [])))

/**
 * POST /api/ai/week (and Ask AI's plan_training_week). In order:
 *   no model key in the workout_template chain           → 409 no_model_key, nothing written
 *   slots   = splitSlots(input.training_days ?? settings.training_days)   (week order; the split those days give)
 *   `only` naming no slot of it                          → 400, nothing written
 *   input.training_days → settings proposeTrainingDays: applied (user, mcp), proposed (ai) or unchanged
 *   queued  = the slots in `only` (all when absent) with no workout_template job queued or running for their name, each
 *             a job at USER_PRIORITY, payload { slot, replace: true when a template holds its name }, in one db.batch
 *   skipped = the other slots' names
 *   run now = the first ⌊(tally.limit − tally.used) / LLM_FETCHES⌋ queued jobs (RUN_NOW_WITHOUT_TALLY without a tally),
 *             in parallel after the response; the rest wait for the 5-minute sweep
 * Each draft is the job's own (lib/split: it supersedes that day's older pending drafts), so pressing it twice leaves
 * one pending draft per day.
 */
export async function planTrainingWeek(deps: Deps, input: PlanWeekRequest): Promise<PlanWeekResult> {
  if (!(await hasModelKey(deps, 'workout_template')))
    throw new HttpError(409, 'no_model_key', 'No AI model has a key: add a model key in Settings → AI first')
  const { db } = deps
  const [[s], templates, drafting] = await db.batch([
    db.select({ training_days: settings.training_days }).from(settings).limit(1),
    db.select({ name: workout_templates.name }).from(workout_templates),
    draftingJobs(deps),
  ])
  if (!s) throw notFound('Settings (seed the database)')
  const slots = splitSlots(input.training_days ?? s.training_days)
  const key = (name: string) => splitNameKey(name)
  const only = input.only ? new Set(input.only.map(key)) : null
  const unknown = input.only?.filter((name) => !slots.some((slot) => key(slot.name) === key(name))) ?? []
  if (unknown.length)
    throw badRequest(`Not a day of the split: ${unknown.join(', ')} (the split is ${slots.map((slot) => slot.name).join(', ') || 'empty'})`)

  const days = input.training_days ? await proposeTrainingDays(deps, { training_days: input.training_days }) : null
  const busy = keysOf(drafting.map((j) => j.name))
  const templated = keysOf(templates.map((t) => t.name))
  const queue = slots.filter((slot) => (!only || only.has(key(slot.name))) && !busy.has(key(slot.name)))
  const jobs = queue.map((slot) =>
    jobInsert(deps, {
      type: 'workout_template',
      payload: templated.has(key(slot.name)) ? { slot, replace: true } : { slot },
      priority: USER_PRIORITY,
    }),
  )
  const [first, ...rest] = jobs.map((j) => j.statement)
  if (first) await db.batch([first, ...rest])

  const room = deps.budget ? Math.floor((deps.budget.limit - deps.budget.used) / LLM_FETCHES) : RUN_NOW_WITHOUT_TALLY
  for (const job of jobs.slice(0, Math.max(room, 0))) runSoon(deps, job.id)
  return {
    slots,
    job_ids: jobs.map((j) => j.id),
    skipped: slots.filter((slot) => !queue.includes(slot)).map((slot) => slot.name),
    training_days: { status: days?.status ?? 'unchanged', proposal_id: days?.proposal_id ?? null },
  }
}

/**
 * GET /api/ai/week. One db.batch of reads. For each slot of splitSlots(settings.training_days):
 *   template = the oldest template whose name has the slot's key (id, name, exercise count, Σ sets, muscle scores)
 *   draft    = the newest pending split draft of that name (draft window), replaces_template_id = template?.id ?? null
 *   drafting = a workout_template job queued or running for that name
 * week_plan_sessions = this week's active week plan: weekday → its session's name (null = rest day), or null when
 *   there is no such plan or it has no session; uncovered = missingGroups(BODY_GROUPS, the primary muscles of every
 *   exercise of the slots' templates) (engine), so a draft still waiting for his tap does not count.
 */
export async function trainingWeek(deps: Deps): Promise<TrainingWeek> {
  const { db } = deps
  const [[s], templates, items, drafts, drafting, plans] = await db.batch([
    db.select({ training_days: settings.training_days }).from(settings).limit(1),
    db
      .select({ id: workout_templates.id, name: workout_templates.name, muscle_scores: workout_templates.muscle_scores })
      .from(workout_templates)
      .orderBy(asc(workout_templates.created_at), asc(workout_templates.id)),
    db
      .select({ template_id: template_exercises.template_id, sets: template_exercises.sets, primary_muscles: exercises.primary_muscles })
      .from(template_exercises)
      .innerJoin(exercises, eq(exercises.id, template_exercises.exercise_id)),
    pendingSplitDrafts(deps),
    draftingJobs(deps),
    db
      .select({ plan: week_plans.plan })
      .from(week_plans)
      .where(and(eq(week_plans.week_start, weekStart(today(deps.now()))), eq(week_plans.status, 'active')))
      .limit(1),
  ])
  if (!s) throw notFound('Settings (seed the database)')
  const busy = keysOf(drafting.map((j) => j.name))
  const muscles: Muscle[] = []
  const slots = splitSlots(s.training_days).map((slot) => {
    const key = splitNameKey(slot.name)
    const t = templates.find((row) => splitNameKey(row.name) === key)
    const own = t ? items.filter((i) => i.template_id === t.id) : []
    muscles.push(...own.flatMap((i) => i.primary_muscles))
    const d = drafts.find((row) => typeof row.name === 'string' && splitNameKey(row.name) === key)
    return {
      ...slot,
      template: t
        ? { id: t.id, name: t.name, exercise_count: own.length, sets: own.reduce((n, i) => n + i.sets, 0), muscle_scores: t.muscle_scores ?? {} }
        : null,
      draft: d ? { proposal_id: d.id, replaces_template_id: t?.id ?? null } : null,
      drafting: busy.has(key),
    }
  })
  const plan = plans[0] ? WeekPlanContent.safeParse(plans[0].plan) : null
  const sessions = plan?.success ? plan.data.sessions : null
  const week_plan_sessions =
    sessions && Weekday.options.some((d) => sessions[d])
      ? Object.fromEntries(Weekday.options.map((d) => [d, sessions[d]?.name ?? null]))
      : null
  return { training_days: s.training_days, slots, week_plan_sessions, uncovered: missingGroups(BODY_GROUPS, muscles) }
}
