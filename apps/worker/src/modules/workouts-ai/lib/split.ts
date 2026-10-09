// Owns: the drafts of the weekly split (plan 2026-10-09-split-drafts-and-swap, decisions 3 and 5–9) — which split day
// the cron drafts next as a workout_template job, and what the earlier days of a draft's focus already hold, so Upper B
// varies from Upper A. A split day, a template and a draft are matched by name, trimmed and case-insensitive
// ("Upper A" = " upper a "), so deleting or renaming a template brings a fresh draft for that day.
import { splitSlots } from '@fitness/shared/engine'
import { ProposalBody, type SplitSlot, type Template, type Weekday } from '@fitness/shared/schemas'
import { and, desc, eq, gte, inArray, or, sql } from 'drizzle-orm'
import { ai_events, ai_jobs, settings, workout_templates } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { enqueue } from '../../jobs'
import { BACKGROUND_PRIORITY } from './plan'

const HOUR_MS = 3_600_000
/** After a failed draft (no key fails at once, decision 8) the next one waits this long instead of failing every tick. */
const FAILED_WAIT_HOURS = 24
/** A dismissed (rejected) draft keeps its split day from being drafted again for this long (decision 7). */
const DISMISSED_DAYS = 28
/** Drafts are read over this window (the ai_events created_at index); an older draft no longer counts. */
const DRAFT_WINDOW_DAYS = 90

/** The key a split day, a template and a draft are matched by. */
export const nameKey = (name: string) => name.trim().toLowerCase()

const hoursAgo = (deps: Deps, hours: number) => new Date(deps.now().getTime() - hours * HOUR_MS).toISOString()

/** Workout proposals that carry a name (the split's drafts), created within the draft window. */
const splitDraftRows = (deps: Deps) =>
  and(
    gte(ai_events.created_at, hoursAgo(deps, DRAFT_WINDOW_DAYS * 24)),
    eq(ai_events.kind, 'proposal'),
    sql`json_extract(${ai_events.body}, '$.kind') = 'workout'`,
    sql`json_extract(${ai_events.body}, '$.workout.name') IS NOT NULL`,
  )

export interface SplitDraftResult {
  /** The split day queued ("Upper A"); null when nothing was queued. */
  slot: string | null
  job_id: string | null
  reason: string
}

/**
 * Cron, last in every tick. Queues at most one background workout_template job, so the split's drafts are written one
 * after another (B after A, so it can vary from it), each picked up by the next tick's sweep:
 *   stop when  no training days                                   → 'no training days are set'
 *              a workout_template job is queued or running         → 'a split draft is being written'
 *              one failed in the last 24 h                         → 'waiting after a failed draft'
 *              every split day has a template                      → 'every split day has a template'
 *   else       the first split day (Mon → Sun) with no template, no pending draft and no draft dismissed in the last
 *              28 days gets the job                                 → 'queued'
 *              none left                                           → 'every split day has a template or a draft'
 * One read when every day has a template (the usual case); the drafts are read only when a day lacks one.
 */
export async function ensureSplitDrafts(deps: Deps): Promise<SplitDraftResult> {
  const { db } = deps
  const isDraftJob = eq(ai_jobs.type, 'workout_template')
  const [[s], templates, writing, failed] = await db.batch([
    db.select({ training_days: settings.training_days }).from(settings).limit(1),
    db.select({ name: workout_templates.name }).from(workout_templates),
    db
      .select({ id: ai_jobs.id })
      .from(ai_jobs)
      .where(and(inArray(ai_jobs.status, ['queued', 'running']), isDraftJob))
      .limit(1),
    db
      .select({ id: ai_jobs.id })
      .from(ai_jobs)
      .where(and(eq(ai_jobs.status, 'failed'), isDraftJob, gte(ai_jobs.updated_at, hoursAgo(deps, FAILED_WAIT_HOURS))))
      .limit(1),
  ])
  const stop = (reason: string): SplitDraftResult => ({ slot: null, job_id: null, reason })
  const slots = splitSlots(s?.training_days ?? [])
  if (!slots.length) return stop('no training days are set')
  if (writing.length) return stop('a split draft is being written')
  if (failed.length) return stop('waiting after a failed draft')
  const templated = new Set(templates.map((t) => nameKey(t.name)))
  const open = slots.filter((slot) => !templated.has(nameKey(slot.name)))
  if (!open.length) return stop('every split day has a template')

  const drafts = await db
    .select({ name: sql<unknown>`json_extract(${ai_events.body}, '$.workout.name')` })
    .from(ai_events)
    .where(
      and(
        splitDraftRows(deps),
        or(
          eq(ai_events.proposal_status, 'pending'),
          // A proposal's updated_at is when it was decided (events.proposalDecisionUpdate).
          and(eq(ai_events.proposal_status, 'rejected'), gte(ai_events.updated_at, hoursAgo(deps, DISMISSED_DAYS * 24))),
        ),
      ),
    )
  const drafted = new Set(drafts.flatMap((d) => (typeof d.name === 'string' ? [nameKey(d.name)] : [])))
  const next = open.find((slot) => !drafted.has(nameKey(slot.name)))
  if (!next) return stop('every split day has a template or a draft')
  const job = await enqueue(deps, { type: 'workout_template', payload: { slot: next }, priority: BACKGROUND_PRIORITY })
  return { slot: next.name, job_id: job.id, reason: 'queued' }
}

/**
 * The split days before `slot` with its focus (Upper B → Upper A; Upper C → Upper A, Upper B) that already hold
 * exercises — the template of that name, else its newest pending draft — as library slugs, for the prompt's
 * "Already in Upper A: …" line. The pending drafts are read only when such a day has no template.
 */
export async function earlierSameFocus(
  deps: Deps,
  input: {
    slot: SplitSlot
    training_days: readonly Weekday[]
    templates: readonly Pick<Template, 'name' | 'exercises'>[]
    slugOf: (exercise_id: string) => string | undefined
  },
): Promise<{ name: string; slugs: string[] }[]> {
  const slots = splitSlots(input.training_days)
  const at = slots.findIndex((s) => nameKey(s.name) === nameKey(input.slot.name))
  const earlier = slots.slice(0, Math.max(at, 0)).filter((s) => s.focus === input.slot.focus)
  if (!earlier.length) return []
  const held = new Map<string, string[]>(input.templates.map((t) => [nameKey(t.name), t.exercises.map((e) => e.exercise_id)]))
  if (earlier.some((s) => !held.has(nameKey(s.name)))) {
    const rows = await deps.db
      .select({ body: ai_events.body })
      .from(ai_events)
      .where(and(splitDraftRows(deps), eq(ai_events.proposal_status, 'pending')))
      .orderBy(desc(ai_events.created_at))
    for (const row of rows) {
      const body = ProposalBody.safeParse(row.body)
      if (!body.success || body.data.kind !== 'workout' || !body.data.workout.name) continue
      const key = nameKey(body.data.workout.name)
      if (!held.has(key)) held.set(key, body.data.workout.exercises.map((e) => e.exercise_id))
    }
  }
  return earlier.flatMap((s) => {
    const slugs = (held.get(nameKey(s.name)) ?? []).flatMap((id) => input.slugOf(id) ?? [])
    return slugs.length ? [{ name: s.name, slugs }] : []
  })
}
