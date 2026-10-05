// Owns: workout templates — ordered exercises (sets, rep range, target load, rest, note) with the engine's muscle-score
// snapshot, written as one db.batch (template row + replaced exercise rows [+ the accepted proposal]).
// Templates written by ai/mcp pass the workout guards; Aaron's own may hold any library exercise.
import { muscleScores } from '@fitness/shared/engine'
import type { Template, TemplateCreate, TemplateExerciseInput, TemplatePatch } from '@fitness/shared/schemas'
import { asc, eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { template_exercises, workout_sessions, workout_templates } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { HttpError, notFound } from '../../../lib/http-error'
import { acceptStatement, guardContext, guardWorkout, loadWorkoutProposal } from './guard'
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

/** Exercises exist (400) and, for ai/mcp, pass the workout guards (422); returns the tags. */
async function checkExercises(deps: Deps, exercises: readonly TemplateExerciseInput[]) {
  const tags = await requireExercises(deps, exercises.map((e) => e.exercise_id))
  if (deps.actor !== 'user') {
    const ctx = await guardContext(deps, await loadLibrary(deps))
    const { rejected } = guardWorkout(ctx, exercises)
    if (rejected.length) throw new HttpError(422, rejected[0]!.rule, rejected.map((r) => r.reason).join('; '), rejected)
  }
  return tags
}

function writeStatements(
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

/** POST /api/templates: create (or, replaying the same id, replace) a template; `proposal_id` accepts that AI draft. */
export async function createTemplate(deps: Deps, input: TemplateCreate): Promise<Template> {
  if (input.proposal_id) await loadWorkoutProposal(deps, input.proposal_id)
  const tags = await checkExercises(deps, input.exercises)
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

/** DELETE /api/templates/:id: sessions started from it keep their sets and plan snapshot but lose the link. */
export async function deleteTemplate(deps: Deps, id: string): Promise<{ ok: true }> {
  const { db } = deps
  await db.batch([
    db.update(workout_sessions).set({ template_id: null, updated_at: deps.now().toISOString() }).where(eq(workout_sessions.template_id, id)),
    db.delete(template_exercises).where(eq(template_exercises.template_id, id)),
    db.delete(workout_templates).where(eq(workout_templates.id, id)),
  ])
  return { ok: true }
}
