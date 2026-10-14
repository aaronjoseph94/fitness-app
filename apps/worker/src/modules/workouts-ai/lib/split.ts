// Owns: the drafts of the weekly split (plan 2026-10-09-split-drafts-and-swap, decisions 3 and 5–9; plan
// 2026-10-14-ai-runs-train-three-day-week, decision 11) — which split day the cron drafts next as a workout_template job,
// which pending drafts it dismisses because their day left the split, what the earlier days already hold (the days of
// the draft's focus, every earlier day for a full-body day), so Upper B varies from Upper A, and the statement that
// supersedes a day's older pending drafts when a new one is written (at most one pending draft per split day). A split
// day, a template and a draft are matched by the engine's splitNameKey (trimmed, case-insensitive: "Upper A" =
// " upper a "), so deleting or renaming a template brings a fresh draft. A split is the settings' training days or the
// days of a pending training_days proposal (Aaron has not tapped it yet), so the AI's drafts for those days survive.
import { splitNameKey, splitSlots, splitTemplateFor } from '@fitness/shared/engine'
import { ProposalBody, type SplitSlot, type Template, type Weekday } from '@fitness/shared/schemas'
import { and, desc, eq, gte, inArray, ne, or, sql } from 'drizzle-orm'
import { ai_events, ai_jobs, chunk, runBatch, settings, workout_templates } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { enqueue } from '../../jobs'
import { BACKGROUND_PRIORITY } from './plan'

const HOUR_MS = 3_600_000
/** After a failed draft (no key fails at once, decision 8) the next one waits this long instead of failing every tick. */
const FAILED_WAIT_HOURS = 24
/** A dismissed (rejected) draft keeps its split day from being drafted again for this long (decision 7). */
const DISMISSED_DAYS = 28
/**
 * Drafts are read over this window (the ai_events created_at index): the dismissal window, so no more is read than a
 * dismissal needs. An older draft no longer counts, so a draft left pending this long is drafted afresh (and the new
 * one supersedes it: supersedeDraftsUpdate).
 */
export const DRAFT_WINDOW_DAYS = DISMISSED_DAYS

export const hoursAgo = (deps: Deps, hours: number) =>
  new Date(deps.now().getTime() - hours * HOUR_MS).toISOString()

/** Workout proposals that carry a name (the split's drafts), created within the draft window. */
const splitDraftRows = (deps: Deps) =>
  and(
    gte(ai_events.created_at, hoursAgo(deps, DRAFT_WINDOW_DAYS * 24)),
    eq(ai_events.kind, 'proposal'),
    sql`json_extract(${ai_events.body}, '$.kind') = 'workout'`,
    sql`json_extract(${ai_events.body}, '$.workout.name') IS NOT NULL`,
  )

/** The pending split drafts (draft window), newest first: id, the split day's name and when it was written. */
export const pendingSplitDrafts = (deps: Deps) =>
  deps.db
    .select({
      id: ai_events.id,
      name: sql<unknown>`json_extract(${ai_events.body}, '$.workout.name')`,
      created_at: ai_events.created_at,
    })
    .from(ai_events)
    .where(and(splitDraftRows(deps), eq(ai_events.proposal_status, 'pending')))
    .orderBy(desc(ai_events.created_at))

/** Pending training_days proposals (draft window), newest first. */
const proposedDaysRows = (deps: Deps) =>
  deps.db
    .select({ body: ai_events.body })
    .from(ai_events)
    .where(
      and(
        gte(ai_events.created_at, hoursAgo(deps, DRAFT_WINDOW_DAYS * 24)),
        eq(ai_events.kind, 'proposal'),
        eq(ai_events.proposal_status, 'pending'),
        sql`json_extract(${ai_events.body}, '$.kind') = 'training_days'`,
      ),
    )
    .orderBy(desc(ai_events.created_at))

/** The proposed days of each training_days proposal row (a body that does not parse is skipped). */
function parseDays(rows: readonly { body: unknown }[]): Weekday[][] {
  return rows.flatMap((r) => {
    const body = ProposalBody.safeParse(r.body)
    return body.success && body.data.kind === 'training_days' ? [body.data.training_days] : []
  })
}

/** Rows per UPDATE … WHERE id IN (…): 3 set values + 'pending' + the ids stay under 100 bound parameters. */
const IDS_PER_UPDATE = 90

/** Reject these pending drafts (decided as events.proposalDecisionUpdate decides), in one db.batch. */
async function dismissDrafts(deps: Deps, ids: readonly string[]): Promise<void> {
  const now = deps.now().toISOString()
  const updates = chunk(ids, IDS_PER_UPDATE).map((part) =>
    deps.db
      .update(ai_events)
      .set({ proposal_status: 'rejected', read_at: now, updated_at: now })
      .where(and(inArray(ai_events.id, part), eq(ai_events.proposal_status, 'pending'))),
  )
  await runBatch(deps.db, updates)
}

/**
 * Reject every other pending workout proposal for the split day `name` (json_extract $.workout.name, matched by
 * lower(trim(…)) = splitNameKey(name)), for the db.batch that writes the new draft `keep_id`: at most one pending draft
 * per split day. Every age, not only the draft window: an ignored draft is what this replaces. Decided as
 * events.proposalDecisionUpdate decides (updated_at = read_at = now).
 */
export function supersedeDraftsUpdate(deps: Deps, input: { name: string; keep_id: string }) {
  const now = deps.now().toISOString()
  return deps.db
    .update(ai_events)
    .set({ proposal_status: 'rejected', read_at: now, updated_at: now })
    .where(
      and(
        eq(ai_events.kind, 'proposal'),
        eq(ai_events.proposal_status, 'pending'),
        ne(ai_events.id, input.keep_id),
        sql`json_extract(${ai_events.body}, '$.kind') = 'workout'`,
        sql`lower(trim(json_extract(${ai_events.body}, '$.workout.name'))) = ${splitNameKey(input.name)}`,
      ),
    )
}

export interface SplitDraftResult {
  /** The split day queued ("Upper A"); null when nothing was queued. */
  slot: string | null
  job_id: string | null
  reason: string
}

/**
 * Cron, last in every tick. First it dismisses (rejects) every pending split draft (draft window) whose name is in
 * neither splitSlots(settings) nor splitSlots(the days of a pending training_days proposal): its day left the split, and
 * a draft for a day the AI proposed stays while that proposal waits for his tap (decision 11). Then it queues at most
 * one background workout_template job, so the split's drafts are written one after another (B after A, so it can vary
 * from it), each picked up by the next tick's sweep:
 *   stop when  no training days                                   → 'no training days are set'
 *              a workout_template job is queued or running         → 'a split draft is being written'
 *              one failed in the last 24 h                         → 'waiting after a failed draft'
 *              every split day has a template                      → 'every split day has a template'
 *   else       the first split day (Mon → Sun) with no template, no pending draft and no draft dismissed in the last
 *              28 days gets the job                                 → 'queued'
 *              none left                                           → 'every split day has a template or a draft'
 * The usual tick (every day has a template, nothing to dismiss) is one batch of reads, the pending rows over the draft
 * window's created_at index range; the decided drafts are read only when a day lacks a template, and a write happens
 * only when a draft is dismissed or a job queued.
 */
export async function ensureSplitDrafts(deps: Deps): Promise<SplitDraftResult> {
  const { db } = deps
  const isDraftJob = eq(ai_jobs.type, 'workout_template')
  const [[s], templates, writing, failed, pendingDrafts, proposed] = await db.batch([
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
      .where(
        and(
          eq(ai_jobs.status, 'failed'),
          isDraftJob,
          gte(ai_jobs.updated_at, hoursAgo(deps, FAILED_WAIT_HOURS)),
        ),
      )
      .limit(1),
    pendingSplitDrafts(deps),
    proposedDaysRows(deps),
  ])
  const slots = splitSlots(s?.training_days ?? [])
  const allowed = new Set(
    [slots, ...parseDays(proposed).map(splitSlots)].flatMap((split) =>
      split.map((slot) => splitNameKey(slot.name)),
    ),
  )
  await dismissDrafts(
    deps,
    pendingDrafts.flatMap((d) =>
      typeof d.name === 'string' && !allowed.has(splitNameKey(d.name)) ? [d.id] : [],
    ),
  )

  const stop = (reason: string): SplitDraftResult => ({ slot: null, job_id: null, reason })
  if (!slots.length) return stop('no training days are set')
  if (writing.length) return stop('a split draft is being written')
  if (failed.length) return stop('waiting after a failed draft')
  const templated = new Set(templates.map((t) => splitNameKey(t.name)))
  const open = slots.filter((slot) => !templated.has(splitNameKey(slot.name)))
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
          and(
            eq(ai_events.proposal_status, 'rejected'),
            gte(ai_events.updated_at, hoursAgo(deps, DISMISSED_DAYS * 24)),
          ),
        ),
      ),
    )
  const drafted = new Set(drafts.flatMap((d) => (typeof d.name === 'string' ? [splitNameKey(d.name)] : [])))
  const next = open.find((slot) => !drafted.has(splitNameKey(slot.name)))
  if (!next) return stop('every split day has a template or a draft')
  const job = await enqueue(deps, {
    type: 'workout_template',
    payload: { slot: next },
    priority: BACKGROUND_PRIORITY,
  })
  return { slot: next.name, job_id: job.id, reason: 'queued' }
}

/**
 * The split that holds `slot` (its name): the settings' days when their split has it, else the newest pending
 * training_days proposal whose split has it (the AI drafts the days it proposed before he taps them), else the settings'.
 */
export async function splitOf(
  deps: Deps,
  slot: SplitSlot,
  training_days: readonly Weekday[],
): Promise<SplitSlot[]> {
  const holds = (split: SplitSlot[]) => split.some((s) => splitNameKey(s.name) === splitNameKey(slot.name))
  const own = splitSlots(training_days)
  if (holds(own)) return own
  return (
    parseDays(await proposedDaysRows(deps))
      .map(splitSlots)
      .find(holds) ?? own
  )
}

/**
 * The split days before `slot` (in `slots`, the split that holds it: splitOf) that already hold exercises — the split
 * day's template (engine splitTemplateFor: the oldest of its name), else its newest pending draft — as library slugs,
 * for the prompt's "Already in Upper A: …" line: the days of its focus (Upper B → Upper A; Upper C → Upper A, Upper
 * B), and every earlier day for a full-body day (Full body after Upper A and Lower A → both). The pending drafts are
 * read only when such a day has no template.
 */
export async function earlierDays(
  deps: Deps,
  input: {
    slot: SplitSlot
    slots: readonly SplitSlot[]
    templates: readonly Pick<Template, 'id' | 'name' | 'created_at' | 'exercises'>[]
    slugOf: (exercise_id: string) => string | undefined
  },
): Promise<{ name: string; slugs: string[] }[]> {
  const { slots } = input
  const at = slots.findIndex((s) => splitNameKey(s.name) === splitNameKey(input.slot.name))
  const earlier = slots
    .slice(0, Math.max(at, 0))
    .filter((s) => input.slot.focus === 'full' || s.focus === input.slot.focus)
  if (!earlier.length) return []
  const held = new Map<string, string[]>()
  for (const s of earlier) {
    const t = splitTemplateFor(input.templates, s.name)
    if (t)
      held.set(
        splitNameKey(s.name),
        t.exercises.map((e) => e.exercise_id),
      )
  }
  if (earlier.some((s) => !held.has(splitNameKey(s.name)))) {
    const rows = await deps.db
      .select({ body: ai_events.body })
      .from(ai_events)
      .where(and(splitDraftRows(deps), eq(ai_events.proposal_status, 'pending')))
      .orderBy(desc(ai_events.created_at))
    for (const row of rows) {
      const body = ProposalBody.safeParse(row.body)
      if (!body.success || body.data.kind !== 'workout' || !body.data.workout.name) continue
      const key = splitNameKey(body.data.workout.name)
      if (!held.has(key))
        held.set(
          key,
          body.data.workout.exercises.map((e) => e.exercise_id),
        )
    }
  }
  return earlier.flatMap((s) => {
    const slugs = (held.get(splitNameKey(s.name)) ?? []).flatMap((id) => input.slugOf(id) ?? [])
    return slugs.length ? [{ name: s.name, slugs }] : []
  })
}
