// Owns: swapping one exercise of a template for another (SPEC §9 safe list: exercise swaps within the same primary
// muscle and, by the engine rule the swap picker uses, the same kind of lift; allowed exercise set only) — the checks,
// the guarded apply-or-propose through the plan module, and the write: the new exercise takes the old one's place,
// sets, rep range and rest (target load cleared: another lift).
// Also what accepting the AI proposals training owns does: a workout becomes a template; a template swap applies.
// After a swap is written, the swap listeners run (week-plans registers one: planned sessions copied from the template
// follow it), so training never imports week-plans.
import { applyGuards, sameLiftKind, type ExerciseSwapChange } from '@fitness/shared/engine'
import type { ProposalApplied, ProposalBody, Template, TemplateExerciseInput } from '@fitness/shared/schemas'
import type { Deps } from '../../../lib/deps'
import { HttpError, notFound } from '../../../lib/http-error'
import { applySafeChange, type ProposalOf, type SafeChangeResult } from '../../plan'
import { guardContext } from './guard'
import { loadLibrary, type Library, type LibraryEntry } from './library'
import { createTemplate, getTemplate, updateTemplate } from './templates'

export interface SwapInput {
  template_id: string
  from_exercise_id: string
  to_exercise_id: string
}

type SwapBody = Extract<ProposalBody, { kind: 'template_swap' }>

/** Runs after a swap was written to a template. */
export type SwapListener = (deps: Deps, swap: SwapInput) => Promise<void>
const listeners: SwapListener[] = []

/** Register a swap listener (week-plans does, when it loads). */
export function onTemplateSwap(listener: SwapListener): void {
  listeners.push(listener)
}

/** Tell the listeners a swap was written (every swap path calls this). A failing listener is logged: the swap stands. */
export async function templateSwapped(deps: Deps, swap: SwapInput): Promise<void> {
  for (const listener of listeners) {
    try {
      await listener(deps, swap)
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', msg: 'template swap listener failed', template_id: swap.template_id, error: String(err) }))
    }
  }
}

/**
 * The template and both exercises, after the checks no guard makes: in the template, in the library, same primary
 * muscle, and the same kind of lift (engine sameLiftKind: strength / powerlifting / no category together, any other
 * category only with itself), so no path swaps Leg Press for a bike the picker would never offer.
 */
function checkSwap(template: Template, library: Library, input: SwapInput): { from: LibraryEntry; to: LibraryEntry } {
  const from = library.byId.get(input.from_exercise_id)
  const to = library.byId.get(input.to_exercise_id)
  if (!from || !template.exercises.some((e) => e.exercise_id === from.id))
    throw new HttpError(422, 'not_in_template', `Exercise ${input.from_exercise_id} is not in the template "${template.name}"`)
  if (!to) throw notFound('Exercise')
  if (template.exercises.some((e) => e.exercise_id === to.id))
    throw new HttpError(422, 'already_in_template', `${to.name} is already in the template "${template.name}"`)
  if (!from.primary_muscles.some((m) => to.primary_muscles.includes(m)))
    throw new HttpError(422, 'different_primary_muscle', `${to.name} does not share a primary muscle with ${from.name}; a swap stays within the same muscle`)
  if (!sameLiftKind(from, to)) throw new HttpError(422, 'different_kind_of_lift', `${to.name} is not the same kind of lift as ${from.name}`)
  return { from, to }
}

const swapped = (template: Template, input: SwapInput): TemplateExerciseInput[] =>
  template.exercises.map(({ id: _id, ...e }) =>
    e.exercise_id === input.from_exercise_id ? { ...e, exercise_id: input.to_exercise_id, target_load_kg: null, note: null } : e,
  )

/**
 * Write the swap. The new exercise already passed the exercise_swap guard (allowed set, no excluded category), and
 * updateTemplate re-runs the whole-workout guards on the new list (checkExercises: every exercise in the allowed set,
 * no excluded category, 12–28 sets), so a template that no longer passes them (a machine since marked don't have)
 * answers 422 instead of being written.
 */
async function writeSwap(deps: Deps, template: Template, input: SwapInput): Promise<Template> {
  const updated = await updateTemplate({ ...deps, actor: 'user' }, template.id, { exercises: swapped(template, input) })
  await templateSwapped(deps, { template_id: template.id, from_exercise_id: input.from_exercise_id, to_exercise_id: input.to_exercise_id })
  return updated
}

/**
 * swap_template_exercise: checked (in the template, same primary muscle, same kind of lift), then guarded as
 * deps.actor — applied now (Aaron, Claude; Ask AI only with auto_apply_safe on) or stored as a pending 'template_swap'
 * proposal.
 */
export async function swapTemplateExercise(deps: Deps, input: SwapInput): Promise<SafeChangeResult<Template>> {
  const [template, library] = await Promise.all([getTemplate(deps, input.template_id), loadLibrary(deps)])
  const { from, to } = checkSwap(template, library, input)
  const body: SwapBody = {
    kind: 'template_swap',
    template_id: template.id,
    template_name: template.name,
    from_exercise_id: from.id,
    from_name: from.name,
    to_exercise_id: to.id,
    to_name: to.name,
  }
  return applySafeChange(deps, {
    change: { kind: 'exercise_swap', from_exercise_id: from.id, to_exercise_id: to.id },
    exercises: library.exercises,
    excluded_categories: library.excluded_categories,
    body,
    summary: `Swap ${from.name} for ${to.name} in "${template.name}"`.slice(0, 300),
    apply: () => writeSwap(deps, template, input),
  })
}

/** Accepting a template_swap proposal: the checks and the allowed set again (the library may have changed), then the write. */
export async function acceptTemplateSwap(deps: Deps, proposal: ProposalOf<'template_swap'>): Promise<{ plan_version_id: null; applied: ProposalApplied }> {
  const [template, library] = await Promise.all([getTemplate(deps, proposal.body.template_id), loadLibrary(deps)])
  const { from, to } = checkSwap(template, library, proposal.body)
  const ctx = await guardContext(deps, library, proposal.actor)
  const { rejected } = applyGuards<ExerciseSwapChange>([{ kind: 'exercise_swap', from_exercise_id: from.id, to_exercise_id: to.id }], ctx)
  if (rejected.length) throw new HttpError(422, rejected[0]!.rule, rejected.map((r) => r.reason).join('; '), rejected)
  await writeSwap(deps, template, proposal.body)
  return { plan_version_id: null, applied: { entity: 'template', id: template.id } }
}

/**
 * Accepting a workout proposal from the plan module: the draft becomes an AI template (guarded as its author), named
 * after its split day when it is one ("Upper A"), else "AI · <date>". The template takes the proposal's id, so a
 * double-tapped or replayed accept rewrites the same template, never a second.
 */
export async function acceptWorkout(deps: Deps, proposal: ProposalOf<'workout'>): Promise<{ plan_version_id: null; applied: ProposalApplied }> {
  const { body } = proposal
  const template = await createTemplate(
    { ...deps, actor: proposal.actor },
    {
      id: proposal.id,
      name: body.workout.name ?? `AI · ${body.date ?? 'workout'}`,
      origin: 'ai',
      notes: body.workout.rationale || undefined,
      exercises: body.workout.exercises,
      proposal_id: proposal.id,
    },
  )
  return { plan_version_id: null, applied: { entity: 'template', id: template.id } }
}
