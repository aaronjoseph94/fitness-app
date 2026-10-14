// Owns: workout templates — ordered exercises (sets, rep range, target load, rest, note) with the engine's muscle-score
// snapshot, written as one db.batch (template row + replaced exercise rows [+ the accepted proposal]).
// Every exercise list a template is given passes the workout guards, Aaron's own too (CLAUDE.md rails: the allowed
// exercise set, 12–28 sets per session); a patch that keeps the list (rename, notes) does not re-check it, nor does
// Undo (lib/changes), which puts back a version saved before. lib/changes builds its batches from the same write and
// delete statements. A split day's template is the oldest of its name (engine splitTemplateFor); saving a split draft
// named like one writes into it in place (same id) with its old version kept on the proposal as `replaced`, the same
// batch Keep (lib/changes replaceWithDraft) writes, so a split day never gets a second template of its name.
import { muscleScores, splitNameKey, splitTemplateFor } from '@fitness/shared/engine'
import type { Template, TemplateCreate, TemplateExerciseInput, TemplatePatch, TemplateSnapshot } from '@fitness/shared/schemas'
import { asc, eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { ai_events, template_exercises, workout_sessions, workout_templates } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { HttpError, notFound } from '../../../lib/http-error'
import type { ProposalOf } from '../../plan'
import { acceptStatement, guardContext, guardWorkout, loadWorkoutProposal, proposalBodyUpdate } from './guard'
import { loadLibrary, requireExercises } from './library'
import { chunk, toTemplate, type ExerciseTags } from './rows'

/** template_exercises has 12 columns: 8 rows per insert stays under 100 bound parameters. */
const ROWS_PER_INSERT = 8

export async function listTemplates(deps: Deps): Promise<Template[]> {
  const [rows, items] = await deps.db.batch([
    deps.db.select().from(workout_templates).orderBy(asc(workout_templates.name)),
    deps.db.select().from(template_exercises).orderBy(asc(template_exercises.template_id), asc(template_exercises.sort_order)),
  ])
  return rows.map((t) => toTemplate(t, items.filter((i) => i.template_id === t.id)))
}

export async function getTemplate(deps: Deps, id: string): Promise<Template> {
  const [[row], items] = await deps.db.batch([
    deps.db.select().from(workout_templates).where(eq(workout_templates.id, id)),
    deps.db.select().from(template_exercises).where(eq(template_exercises.template_id, id)),
  ])
  if (!row) throw notFound('Template')
  return toTemplate(row, items)
}

/** A template's exercises as a plan snapshot, or null when there is no such template. */
export async function templatePlan(deps: Deps, id: string): Promise<TemplateExerciseInput[] | null> {
  const template = await getTemplate(deps, id).catch((e: unknown) => {
    if (e instanceof HttpError && e.status === 404) return null
    throw e
  })
  return template?.exercises.map(({ id: _id, ...e }) => e) ?? null
}

/** muscle score per muscle = Σ sets × (1.0 primary, 0.5 secondary) over the template's exercises (engine). */
export function scoresOf(exercises: readonly TemplateExerciseInput[], tags: ReadonlyMap<string, ExerciseTags>) {
  return muscleScores(exercises.flatMap((e) => (tags.has(e.exercise_id) ? [{ ...tags.get(e.exercise_id)!, sets: e.sets }] : [])))
}

/**
 * Exercises exist (400) and pass the workout guards (422: allowed exercise set, no excluded category, 12–28 sets);
 * returns the tags. Templates check every list; sessions check the explicit lists of ai/mcp.
 */
export async function checkExercises(deps: Deps, exercises: readonly TemplateExerciseInput[]) {
  const tags = await requireExercises(deps, exercises.map((e) => e.exercise_id))
  const library = await loadLibrary(deps)
  const { rejected } = guardWorkout(await guardContext(deps, library), exercises)
  if (rejected.length) {
    // Name the exercise instead of its id: the builder shows this message as it is.
    const named = (reason: string) => reason.replace(/Exercise ([0-9a-f-]{36})/g, (all, id: string) => library.byId.get(id)?.name ?? all)
    throw new HttpError(422, rejected[0]!.rule, rejected.map((r) => named(r.reason)).join('; '), rejected)
  }
  return tags
}

/** The writes saving a template (row upserted by id, exercise rows replaced), for the caller's db.batch. */
export function writeStatements(
  deps: Deps,
  t: { id: string; name: string; origin: Template['origin']; notes: string | null; exercises: readonly TemplateExerciseInput[] },
  tags: ReadonlyMap<string, ExerciseTags>,
): BatchItem<'sqlite'>[] {
  const { db } = deps
  const now = deps.now().toISOString()
  const muscle_scores = scoresOf(t.exercises, tags)
  const rows = t.exercises.map((e, i) => ({
    id: crypto.randomUUID(),
    template_id: t.id,
    exercise_id: e.exercise_id,
    sort_order: i,
    sets: e.sets,
    rep_min: e.rep_min,
    rep_max: e.rep_max,
    target_load_kg: e.target_load_kg,
    rest_sec: e.rest_sec,
    note: e.note,
    created_at: now,
    updated_at: now,
  }))
  return [
    db
      .insert(workout_templates)
      .values({ id: t.id, name: t.name, origin: t.origin, notes: t.notes, muscle_scores, created_at: now, updated_at: now })
      .onConflictDoUpdate({
        target: workout_templates.id,
        set: { name: t.name, origin: t.origin, notes: t.notes, muscle_scores, updated_at: now },
      }),
    db.delete(template_exercises).where(eq(template_exercises.template_id, t.id)),
    ...chunk(rows, ROWS_PER_INSERT).map((part) => db.insert(template_exercises).values(part)),
  ]
}

/** A template as it is now, for a later Undo to put back (id, name, origin, notes, exercises). */
export const snapshotOf = (t: Template): TemplateSnapshot => ({
  id: t.id,
  name: t.name,
  origin: t.origin,
  notes: t.notes,
  exercises: t.exercises.map(({ id: _id, ...e }): TemplateExerciseInput => e),
})

/** The template of the split day `name` (engine splitTemplateFor: the oldest of that name), other than `except`. */
export async function splitTemplate(deps: Deps, name: string, except: readonly string[] = []): Promise<Template | null> {
  return splitTemplateFor((await listTemplates(deps)).filter((t) => !except.includes(t.id)), name)
}

/**
 * The writes of a split draft replacing `template` in place (same id, name and origin; `next` = its notes and
 * exercises): the template, the pending proposal's body with `replaced` = the template as it was (Undo puts it back),
 * and the proposal accepted — for the caller's one db.batch. The body rewrite holds only while the proposal is pending.
 */
export function replaceStatements(
  deps: Deps,
  proposal: ProposalOf<'workout'>,
  template: Template,
  next: { notes: string | null; exercises: readonly TemplateExerciseInput[] },
  tags: ReadonlyMap<string, ExerciseTags>,
): BatchItem<'sqlite'>[] {
  return [
    ...writeStatements(deps, { id: template.id, name: template.name, origin: template.origin, ...next }, tags),
    proposalBodyUpdate(deps, proposal.id, { ...proposal.body, replaced: snapshotOf(template) }, eq(ai_events.proposal_status, 'pending')),
    acceptStatement(deps, proposal.id),
  ]
}

/**
 * The template a save with `proposal_id` writes into instead of a new one: the request names the draft's split day
 * (splitNameKey(input.name) = splitNameKey(workout.name)) and
 *   the proposal is pending  → that day's template (splitTemplate, not the request's or the proposal's own id): replace
 *                               it, keeping its old version as `replaced`
 *   it already replaced one  → that template again (a retried or queued save; `replaced` stays the first version),
 *                               unless it was undone since
 * null otherwise (a plain create).
 */
async function replacedBy(deps: Deps, proposal: ProposalOf<'workout'>, input: TemplateCreate): Promise<{ template: Template; first: boolean } | null> {
  const { body } = proposal
  if (!body.workout.name || splitNameKey(body.workout.name) !== splitNameKey(input.name)) return null
  if (proposal.proposal_status === 'pending') {
    const template = await splitTemplate(deps, body.workout.name, [input.id, proposal.id])
    return template && { template, first: true }
  }
  if (!body.replaced || body.reverted_at) return null
  const template = await getTemplate(deps, body.replaced.id).catch((e: unknown) => {
    if (e instanceof HttpError && e.status === 404) return null
    throw e
  })
  return template && { template, first: false }
}

/**
 * POST /api/templates: create (or, replaying the same id, replace) a template; `proposal_id` accepts that AI draft.
 * A split draft saved under its day's name writes into that day's template instead (replacedBy) and returns it, so the
 * returned id can differ from `input.id`.
 */
export async function createTemplate(deps: Deps, input: TemplateCreate): Promise<Template> {
  const proposal = input.proposal_id ? await loadWorkoutProposal(deps, input.proposal_id) : null
  const tags = await checkExercises(deps, input.exercises)
  const replacing = proposal ? await replacedBy(deps, proposal, input) : null
  if (proposal && replacing) {
    const next = { notes: input.notes ?? null, exercises: input.exercises }
    const statements = replacing.first
      ? replaceStatements(deps, proposal, replacing.template, next, tags)
      : writeStatements(deps, { id: replacing.template.id, name: replacing.template.name, origin: replacing.template.origin, ...next }, tags)
    const [first, ...rest] = statements
    await deps.db.batch([first!, ...rest])
    return getTemplate(deps, replacing.template.id)
  }
  const statements = writeStatements(deps, { ...input, notes: input.notes ?? null }, tags)
  if (input.proposal_id) statements.push(acceptStatement(deps, input.proposal_id))
  const [first, ...rest] = statements
  await deps.db.batch([first!, ...rest])
  return getTemplate(deps, input.id)
}

/** PATCH /api/templates/:id: rename, re-note, or replace the exercise list (muscle scores recomputed). */
export async function updateTemplate(deps: Deps, id: string, patch: TemplatePatch): Promise<Template> {
  const current = await getTemplate(deps, id)
  const exercises = patch.exercises ?? current.exercises.map(({ id: _id, ...e }) => e)
  const tags = patch.exercises ? await checkExercises(deps, exercises) : await requireExercises(deps, exercises.map((e) => e.exercise_id))
  const [first, ...rest] = writeStatements(
    deps,
    {
      id,
      name: patch.name ?? current.name,
      origin: current.origin,
      notes: patch.notes === undefined ? current.notes : patch.notes,
      exercises,
    },
    tags,
  )
  await deps.db.batch([first!, ...rest])
  return getTemplate(deps, id)
}

/** The writes deleting a template (sessions unlinked, exercise rows, the row), for the caller's db.batch. */
export function deleteStatements(deps: Deps, id: string) {
  const { db } = deps
  return [
    db.update(workout_sessions).set({ template_id: null, updated_at: deps.now().toISOString() }).where(eq(workout_sessions.template_id, id)),
    db.delete(template_exercises).where(eq(template_exercises.template_id, id)),
    db.delete(workout_templates).where(eq(workout_templates.id, id)),
  ] as const
}

/** DELETE /api/templates/:id: sessions started from it keep their sets and plan snapshot but lose the link. */
export async function deleteTemplate(deps: Deps, id: string): Promise<{ ok: true }> {
  await deps.db.batch(deleteStatements(deps, id))
  return { ok: true }
}
