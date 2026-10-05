// Owns: the engine guards as training applies them — the GuardContext for workout and exercise checks (the allowed
// exercise set, the excluded categories, and the rails from settings and the active plan), and the AI workout
// proposals a template or session accepts.
import { applyGuards, type GuardContext, type GuardResult, type WorkoutChange } from '@fitness/shared/engine'
import type { Actor, Proposal } from '@fitness/shared/schemas'
import { eq } from 'drizzle-orm'
import { plan_versions, settings } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { HttpError, notFound } from '../../../lib/http-error'
import { getProposalRow, proposalDecisionUpdate, toProposal } from '../../events'
import type { Library } from './library'

/**
 * Guard context for workout / exercise_swap changes. `planned_fast_dates` is empty because these batches never carry
 * a fast change; the rails and plan are the real ones so the context stays valid for any change kind.
 */
export async function guardContext(deps: Deps, library: Library, actor: Actor = deps.actor): Promise<GuardContext> {
  const [[s], [p]] = await deps.db.batch([
    deps.db.select().from(settings).limit(1),
    deps.db.select({ targets: plan_versions.targets }).from(plan_versions).where(eq(plan_versions.active, true)).limit(1),
  ])
  if (!s || !p) throw notFound('Settings or the active plan version (seed the database)')
  return {
    actor,
    rails: {
      calorie_floor: s.calorie_floor,
      calorie_ceiling: s.calorie_ceiling,
      protein_min_g: s.protein_min_g,
      fat_min_g: s.fat_min_g,
      fasts_per_month: s.fasts_per_month,
    },
    plan: p.targets,
    exercises: library.exercises,
    excluded_categories: library.excluded_categories,
    planned_fast_dates: [],
    auto_apply_safe: s.auto_apply_safe,
  }
}

/** One workout through the guards (allowed ids, no excluded category, 12–28 sets). */
export function guardWorkout(ctx: GuardContext, exercises: readonly { exercise_id: string; sets: number }[]): GuardResult<WorkoutChange> {
  return applyGuards<WorkoutChange>([{ kind: 'workout', exercises }], ctx)
}

/** A stored AI workout proposal (404 when missing, 422 when it is another kind). */
export async function loadWorkoutProposal(deps: Deps, id: string): Promise<Proposal & { body: { kind: 'workout' } }> {
  const row = await getProposalRow(deps, id)
  if (!row) throw notFound('Proposal')
  const proposal = toProposal(row)
  if (!proposal || proposal.body.kind !== 'workout')
    throw new HttpError(422, 'not_a_workout_proposal', 'Only a workout proposal can become a template or a session')
  return proposal as Proposal & { body: { kind: 'workout' } }
}

/** Mark a pending workout proposal accepted (no-op when already resolved), inside the caller's db.batch. */
export const acceptStatement = (deps: Deps, proposal_id: string) => proposalDecisionUpdate(deps, proposal_id, { status: 'accepted' })
