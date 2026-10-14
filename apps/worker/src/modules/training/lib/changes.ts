// Owns: Train changes and their Undo (plan 2026-10-14-ai-runs-train-three-day-week, decisions 6, 7, 10). A Train change
// is one thing the AI does to Train — a template created, edited or deleted, an equipment status set, an exercise
// hidden. It is checked first (a template's exercise list passes the workout guards as its author: allowed set, 12–28
// sets; the template or exercise exists; 422 otherwise), then Ask AI's waits as a pending `train_change` proposal
// (nothing written) while Aaron's or MCP's applies now, with an `auto_applied` train_change event carrying `before`.
// Accepting the proposal checks again (409 when the template went or the exercise got hidden meanwhile) and applies it
// with the `before` of that moment. Keep on a split draft named like a template (engine splitNameKey) replaces that
// template in place (same id) and keeps its old version on the proposal as `replaced`. Undo puts back exactly the
// stored version, once (409 already_reverted), and never for Ask AI (403). Every apply and undo is ONE db.batch.
// A created template takes the change's event id, so its Undo knows what to delete.
import { splitNameKey } from '@fitness/shared/engine'
import {
  TrainChange,
  type Actor,
  type EquipmentStatus,
  type Ok,
  type ProposalApplied,
  type ProposalBody,
  type Template,
  type TemplateExerciseInput,
  type TemplateSnapshot,
} from '@fitness/shared/schemas'
import { and, eq, sql, type SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { ai_events, equipment_profile, exercise_exclusions, exercises, runBatch, workout_templates } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { HttpError, notFound } from '../../../lib/http-error'
import { eventInsert, getProposalRow, toProposal } from '../../events'
import type { ProposalOf, ProposalOutcome } from '../../plan'
import { unhideStatement } from './exclusions'
import { acceptStatement } from './guard'
import { canonicalEquipment, equipmentStatement, exclusionStatements, requireExercises } from './library'
import { checkExercises, deleteStatements, getTemplate, listTemplates, writeStatements } from './templates'

type TrainChangeBody = Extract<ProposalBody, { kind: 'train_change' }>
type Before = TrainChangeBody['before']

export interface TrainChangeResult {
  /** applied: written now (Aaron, MCP); proposed: a pending train_change proposal waits for Aaron's tap (Ask AI). */
  status: 'applied' | 'proposed'
  /** The train_change event: the pending proposal, or the auto_applied record that Undo reverts. */
  proposal_id: string
  /** What it wrote (status applied). */
  applied: { entity: 'template' | 'equipment' | 'exclusion'; id: string } | null
}

/** A checked change: its card title, what it will overwrite, what it writes, and the statements (not yet run). */
interface Prepared {
  /** The event summary the app shows as the card title (a pending change carries only ids): real names, ≤ 80 chars. */
  title: string
  before: Before
  target: NonNullable<TrainChangeResult['applied']>
  statements: BatchItem<'sqlite'>[]
}

/** Proposing, a change that no longer fits is invalid (422); accepting, the world moved since (409). */
type Stage = 'propose' | 'accept'
const invalid = (stage: Stage, code: string, message: string) => new HttpError(stage === 'propose' ? 422 : 409, code, message)

const snapshotOf = (t: Template): TemplateSnapshot => ({
  id: t.id,
  name: t.name,
  notes: t.notes,
  exercises: t.exercises.map(({ id: _id, ...e }): TemplateExerciseInput => e),
})

const isSnapshot = (before: Before): before is TemplateSnapshot => before !== null && 'exercises' in before

const STATUS_LABEL: Record<EquipmentStatus, string> = { have: 'Have', dont_have: "Don't have", dislike: 'Dislike', cant_use: "Can't use" }
const TITLE_MAX = 80
const titled = (text: string) => (text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1)}…` : text)
const sizeOf = (list: readonly TemplateExerciseInput[]) => `${list.length} exercises, ${list.reduce((n, e) => n + e.sets, 0)} sets`

async function templateOrNull(deps: Deps, id: string): Promise<Template | null> {
  return getTemplate(deps, id).catch((e: unknown) => {
    if (e instanceof HttpError && e.status === 404) return null
    throw e
  })
}

/** checkExercises (exist, then the workout guards as deps.actor), with an exercise not in the library a 422 as well. */
async function guarded(deps: Deps, list: readonly TemplateExerciseInput[]) {
  return checkExercises(deps, list).catch((e: unknown) => {
    throw e instanceof HttpError && e.status === 400 ? new HttpError(422, e.code, e.message, e.details) : e
  })
}

/**
 * Check `change` as `author` and build its writes. `id` is the train_change event's id (a created template's id).
 * Statements write as the author (the actor stored on equipment and exclusion rows), as accepting a workout does.
 */
async function prepare(deps: Deps, change: TrainChange, input: { id: string; author: Actor; stage: Stage }): Promise<Prepared> {
  const as: Deps = { ...deps, actor: input.author }
  switch (change.op) {
    case 'template_create': {
      const tags = await guarded(as, change.exercises)
      const origin = input.author === 'user' ? 'custom' : 'ai'
      return {
        title: titled(`New template: ${change.name}`),
        before: null,
        target: { entity: 'template', id: input.id },
        statements: writeStatements(as, { id: input.id, name: change.name, origin, notes: change.notes ?? null, exercises: change.exercises }, tags),
      }
    }
    case 'template_update':
    case 'template_delete': {
      const current = await templateOrNull(deps, change.template_id)
      if (!current) throw invalid(input.stage, 'template_not_found', `Template ${change.template_id} not found (deleted?)`)
      const before = snapshotOf(current)
      const target = { entity: 'template' as const, id: current.id }
      if (change.op === 'template_delete')
        return { title: titled(`Delete template ${current.name}`), before, target, statements: [...deleteStatements(as, current.id)] }
      // A rename or new notes keeps the list as it is (not re-guarded, as updateTemplate); a new list passes the guards.
      const list = change.exercises ?? before.exercises
      const tags = change.exercises ? await guarded(as, list) : await requireExercises(deps, list.map((e) => e.exercise_id))
      const notes = change.notes === undefined ? current.notes : change.notes
      const t = { id: current.id, name: change.name ?? current.name, origin: current.origin, notes, exercises: list }
      const renamed = change.name !== undefined && change.name !== current.name
      const title = renamed ? `Rename ${current.name} → ${t.name}` : `Edit ${current.name}: ${sizeOf(list)}`
      return { title: titled(title), before, target, statements: writeStatements(as, t, tags) }
    }
    case 'equipment_status': {
      const profile = await deps.db.select().from(equipment_profile)
      const name = canonicalEquipment(change.equipment, profile)
      const existing = profile.find((p) => p.equipment === name)
      const id = existing?.id ?? crypto.randomUUID()
      return {
        title: titled(`${name} → ${STATUS_LABEL[change.status]}`),
        before: existing ? { equipment: existing.equipment, status: existing.status } : null,
        target: { entity: 'equipment', id },
        statements: [equipmentStatement(as, { equipment: change.equipment, status: change.status }, profile, id)],
      }
    }
    case 'exercise_hide': {
      const [[exercise], [hidden]] = await deps.db.batch([
        deps.db.select({ id: exercises.id, name: exercises.name }).from(exercises).where(eq(exercises.id, change.exercise_id)),
        deps.db.select().from(exercise_exclusions).where(eq(exercise_exclusions.exercise_id, change.exercise_id)),
      ])
      if (!exercise) throw new HttpError(422, 'unknown_exercise', `Not in the exercise library: ${change.exercise_id}`)
      if (hidden && hidden.removed_at === null) throw invalid(input.stage, 'already_hidden', `${exercise.name} is already hidden`)
      // A row un-hidden before is hidden again (its id kept); otherwise a new row.
      const id = hidden?.id ?? crypto.randomUUID()
      return {
        title: titled(`Hide ${exercise.name}`),
        before: null,
        target: { entity: 'exclusion', id },
        statements: [...exclusionStatements(as, { id, exercise_id: change.exercise_id, reason: change.reason })],
      }
    }
  }
}

/** Rewrite a proposal's body (and touch it for the since-poll) when `when` holds, for the caller's db.batch. */
function bodyUpdate(deps: Deps, id: string, body: ProposalBody, when: SQL) {
  const now = deps.now().toISOString()
  return deps.db
    .update(ai_events)
    .set({ body, updated_at: now })
    .where(and(eq(ai_events.id, id), eq(ai_events.kind, 'proposal'), when))
}

/**
 * One Train change as deps.actor: checked (422), then Ask AI's stored as a pending train_change proposal (nothing else
 * written), Aaron's or MCP's applied now with its auto_applied train_change event (`before` on it) in the same batch.
 * The event's summary is the card title ("Rename Upper A → Push"); `reason` (the caller's why) is not stored — the AI
 * gives it in its own reply.
 */
export async function trainChange(deps: Deps, input: { change: TrainChange; reason: string }): Promise<TrainChangeResult> {
  const parsed = TrainChange.safeParse(input.change)
  if (!parsed.success) throw new HttpError(422, 'invalid_change', parsed.error.issues.map((i) => i.message).join('; '), parsed.error.issues)
  const change = parsed.data
  const id = crypto.randomUUID()
  const prepared = await prepare(deps, change, { id, author: deps.actor, stage: 'propose' })
  const body: TrainChangeBody = { kind: 'train_change', change, before: prepared.before }
  const summary = prepared.title
  if (deps.actor === 'ai') {
    await eventInsert(deps, { id, kind: 'proposal', summary, body, proposal_status: 'pending' }).statement
    return { status: 'proposed', proposal_id: id, applied: null }
  }
  await runBatch(deps.db, [...prepared.statements, eventInsert(deps, { id, kind: 'proposal', summary, body, proposal_status: 'auto_applied' }).statement])
  return { status: 'applied', proposal_id: id, applied: prepared.target }
}

/**
 * plan.acceptProposal of a train_change: checked again as its author (the template may have gone, the exercise been
 * hidden), then applied with the proposal resolved and its `before` set to what was there now, in one batch.
 */
export async function acceptTrainChange(deps: Deps, proposal: ProposalOf<'train_change'>): Promise<ProposalOutcome> {
  const { change } = proposal.body
  const prepared = await prepare(deps, change, { id: proposal.id, author: proposal.actor, stage: 'accept' })
  await runBatch(deps.db, [
    ...prepared.statements,
    bodyUpdate(deps, proposal.id, { ...proposal.body, before: prepared.before }, eq(ai_events.proposal_status, 'pending')),
    acceptStatement(deps, proposal.id),
  ])
  // ProposalApplied names a template (the app opens it); a deleted one, an equipment row or a hidden exercise: nothing to open.
  const applied: ProposalApplied | null = prepared.target.entity === 'template' && change.op !== 'template_delete' ? { entity: 'template', id: prepared.target.id } : null
  return { plan_version_id: null, applied }
}

/** A template whose name matches `name` (engine splitNameKey: trimmed, case-insensitive), other than `except`. */
export async function templateNamed(deps: Deps, name: string, except: string): Promise<Template | null> {
  return (await listTemplates(deps)).find((t) => t.id !== except && splitNameKey(t.name) === splitNameKey(name)) ?? null
}

/**
 * Keep on a split draft named like `template`: the draft's exercises (guarded as the draft's author) and rationale go
 * into that template in place (same id, name and origin), and the proposal is accepted with the old version as
 * `replaced`, in one batch.
 */
export async function replaceWithDraft(deps: Deps, proposal: ProposalOf<'workout'>, template: Template): Promise<ProposalApplied> {
  const { body } = proposal
  const author: Deps = { ...deps, actor: proposal.actor }
  const tags = await checkExercises(author, body.workout.exercises)
  const t = { id: template.id, name: template.name, origin: template.origin, notes: body.workout.rationale || null, exercises: body.workout.exercises }
  await runBatch(deps.db, [
    ...writeStatements(author, t, tags),
    bodyUpdate(deps, proposal.id, { ...body, replaced: snapshotOf(template) }, eq(ai_events.proposal_status, 'pending')),
    acceptStatement(deps, proposal.id),
  ])
  return { entity: 'template', id: template.id }
}

/**
 * A template put back exactly as `snapshot` (same id; created again if it was deleted, as 'custom' then: a snapshot has
 * no origin). Not re-guarded: Undo restores a version that was saved before.
 */
async function restoreStatements(deps: Deps, snapshot: TemplateSnapshot): Promise<BatchItem<'sqlite'>[]> {
  const [[row], tags] = await Promise.all([
    deps.db.select({ origin: workout_templates.origin }).from(workout_templates).where(eq(workout_templates.id, snapshot.id)),
    requireExercises(deps, snapshot.exercises.map((e) => e.exercise_id)),
  ])
  return writeStatements(deps, { ...snapshot, origin: row?.origin ?? 'custom' }, tags)
}

/** The writes undoing an applied train_change (event `id`). */
async function undoStatements(deps: Deps, id: string, body: TrainChangeBody): Promise<BatchItem<'sqlite'>[]> {
  const { change, before } = body
  switch (change.op) {
    case 'template_create':
      return [...deleteStatements(deps, id)]
    case 'template_update':
    case 'template_delete':
      if (!isSnapshot(before)) throw new HttpError(422, 'invalid_proposal', 'This change has no template version to put back')
      return restoreStatements(deps, before)
    case 'equipment_status': {
      const profile = await deps.db.select().from(equipment_profile)
      if (before && !isSnapshot(before)) return [equipmentStatement(deps, { equipment: before.equipment, status: before.status }, profile)]
      // There was no row: take away the one the change added (absent equipment counts as available).
      return [deps.db.delete(equipment_profile).where(eq(equipment_profile.equipment, canonicalEquipment(change.equipment, profile)))]
    }
    case 'exercise_hide':
      return [unhideStatement(deps, change.exercise_id)]
  }
}

/**
 * Undo an applied train_change, or a kept draft that replaced a template: what it overwrote comes back exactly (even
 * over a later edit) and the event gets `reverted_at`, in one batch. 403 for Ask AI; 409 already_reverted, or
 * not_applied for a proposal never applied; 422 for any other proposal.
 */
export async function revertTrainChange(deps: Deps, id: string): Promise<Ok> {
  if (deps.actor === 'ai') throw new HttpError(403, 'needs_approval', 'Undo is for Aaron (or Claude over the connector); Ask AI cannot undo a change')
  const row = await getProposalRow(deps, id)
  const proposal = row && toProposal(row)
  if (!proposal) throw notFound('Train change')
  const { body } = proposal
  if (body.kind !== 'train_change' && !(body.kind === 'workout' && body.replaced))
    throw new HttpError(422, 'not_revertible', 'Only a Train change, or a kept draft that replaced a template, can be undone here')
  if (proposal.proposal_status !== 'accepted' && proposal.proposal_status !== 'auto_applied')
    throw new HttpError(409, 'not_applied', 'This change was never applied')
  if (body.reverted_at) throw new HttpError(409, 'already_reverted', 'This change was already undone')
  const statements =
    body.kind === 'train_change' ? await undoStatements(deps, id, body) : body.kind === 'workout' && body.replaced ? await restoreStatements(deps, body.replaced) : []
  const reverted = { ...body, reverted_at: deps.now().toISOString() }
  await runBatch(deps.db, [...statements, bodyUpdate(deps, id, reverted, sql`json_extract(${ai_events.body}, '$.reverted_at') IS NULL`)])
  return { ok: true }
}
