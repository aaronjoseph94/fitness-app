// Owns: training (SPEC §7) — the exercise library and the allowed exercise set, the equipment profile and exclusions,
// templates, sessions and sets, finishing a session, exercise history; and the planning context the AI workout jobs
// read. Numbers come from the engine (muscle scores, readiness, progression, deload, recovery, session summary, PRs).
// Interface (REST routes and, in phase 4, the tools layer call these; every write is idempotent on its client id):
//   listExercises(deps, query) / getExercise(deps, id) / createExercise(deps, body)        → Exercise(s) with `allowed`
//   getEquipment(deps) / updateEquipment(deps, body)                                        → EquipmentItem[]
//   createExclusion(deps, body) / deleteExclusion(deps, id)                                 → ExerciseExclusion / Ok
//   listTemplates / getTemplate / createTemplate / updateTemplate / deleteTemplate          → Template (ai/mcp: guarded)
//   startSession(deps, body) / getSession(deps, id) / listSessions(deps, { from, to })      → WorkoutSession
//        start/get carry `plan` (last sets + progression default per exercise), `recovery` and `deload`
//   logSet(deps, session_id, body) / updateSet(deps, id, patch) / deleteSet(deps, id)       → SessionSet / Ok
//   finishSession(deps, id, body)                                                           → { session, summary }
//   exerciseHistory(deps, id)                                                               → ExerciseHistory
//   planningContext(deps, date)          → library, readiness, deload, neighbouring sessions, recent digest, templates
//   progressionFor(deps, input)          → the engine's suggestion per planned exercise (default loads)
//   guardContext(deps, library, actor?)  → GuardContext for workout checks (engine applyGuards)
//   swapTemplateExercise(deps, { template_id, from_exercise_id, to_exercise_id }) → SafeChangeResult<Template>
//        safe list: same primary muscle, allowed set; applied now or proposed (plan.applySafeChange decides)
// Template/session creation with `proposal_id` accepts that pending AI workout proposal in the same batch.
// Registers the 'workout' (→ an AI template) and 'template_swap' proposal handlers for plan.acceptProposal.
// A session stores its readiness score in workout_sessions.readiness and its start plan (plan snapshot, recovery,
// deload) in workout_sessions.plan.
import { addDays, type Progression } from '@fitness/shared/engine'
import type { DeloadStatus, Muscle, Readiness, Template, TemplateExerciseInput } from '@fitness/shared/schemas'
import type { Deps } from '../../lib/deps'
import { registerProposalHandler } from '../plan'
import { trainingDigest, topSetsSince, type TrainingDigest } from './lib/history'
import { exerciseTags, loadLibrary, type Library } from './lib/library'
import { listTemplates } from './lib/templates'
import { deloadOn, neighbourSessions, pastSessions, readinessOn, suggestionFor } from './lib/state'
import { acceptTemplateSwap, acceptWorkout } from './lib/swap'

export {
  createExclusion,
  createExercise,
  getEquipment,
  getExercise,
  listExercises,
  loadLibrary,
  updateEquipment,
  RAIL_EXCLUDED_EQUIPMENT,
  type Library,
  type LibraryEntry,
} from './lib/library'
export { deleteExclusion } from './lib/exclusions'
export { swapTemplateExercise, type SwapInput } from './lib/swap'
export { createTemplate, deleteTemplate, getTemplate, listTemplates, updateTemplate } from './lib/templates'
export { deleteSet, finishSession, getSession, listSessions, logSet, startSession, updateSet } from './lib/sessions'
export { exerciseHistory, type SessionDigest, type TrainingDigest } from './lib/history'
export { guardContext, guardWorkout } from './lib/guard'
export { DEFAULT_REP_RANGE } from './lib/state'
export type { ExerciseTags } from './lib/rows'

/** Days of sessions the planning digest covers (SPEC §7: the last 14 days). */
export const DIGEST_DAYS = 14

export interface PlanningContext {
  date: string
  library: Library
  readiness: Readiness
  deload: DeloadStatus
  /** Sessions the day before and after `date` with their primary muscles (recovery rule). */
  neighbours: { date: string; primary_muscles: Muscle[] }[]
  /** Sessions of the 14 days before `date`, and the latest top set per exercise over 8 weeks. */
  digest: TrainingDigest
  templates: Template[]
}

/** Everything a workout planner reads for a session on `date`, in parallel. */
export async function planningContext(deps: Deps, date: string): Promise<PlanningContext> {
  const [library, readiness, deload, neighbours, digest, templates] = await Promise.all([
    loadLibrary(deps),
    readinessOn(deps, date),
    deloadOn(deps, date),
    neighbourSessions(deps, date),
    trainingDigest(deps, { from: addDays(date, -DIGEST_DAYS), to: addDays(date, -1), since: topSetsSince(date) }),
    listTemplates(deps),
  ])
  return { date, library, readiness, deload, neighbours, digest, templates }
}

/**
 * The engine's double-progression suggestion for each planned exercise, from sessions started before `before`
 * (UTC instant). Exercises not in the library are absent.
 */
export async function progressionFor(
  deps: Deps,
  input: { before: string; exercises: readonly TemplateExerciseInput[]; deload_week: boolean },
): Promise<Map<string, Progression>> {
  const ids = input.exercises.map((e) => e.exercise_id)
  const [tags, past] = await Promise.all([exerciseTags(deps, ids), pastSessions(deps, ids, input.before)])
  const out = new Map<string, Progression>()
  for (const e of input.exercises) {
    const t = tags.get(e.exercise_id)
    if (t) out.set(e.exercise_id, suggestionFor(t, e, past.get(e.exercise_id) ?? [], input.deload_week))
  }
  return out
}

// plan.acceptProposal of the proposals training owns: an AI workout becomes a template; a template swap applies.
registerProposalHandler('workout', { accept: acceptWorkout })
registerProposalHandler('template_swap', { accept: acceptTemplateSwap })
