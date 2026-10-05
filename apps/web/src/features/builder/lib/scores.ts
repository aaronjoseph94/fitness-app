// Owns: what a draft workout trains — muscle scores and map levels through the engine (score = Σ sets × (1.0 primary,
// 0.5 secondary); level = ⌈4 × quantile among trained muscles⌉), total sets against the 12–28 session rail, and the
// starting prescription for a newly added exercise.
import type { Exercise, Muscle, MuscleScores, TemplateExerciseInput } from '@fitness/shared/schemas'
import { muscleLevels, muscleScores, SESSION_SETS, type MuscleLevel } from '@fitness/shared/engine'

export interface DraftTraining {
  scores: MuscleScores
  levels: Record<Muscle, MuscleLevel>
  totalSets: number
  /** Muscles by score, highest first (trained only). */
  top: Muscle[]
  /** Outside the 12–28 sets per session rail (the AI is held to it; a custom template only gets a hint). */
  outsideRail: 'under' | 'over' | null
}

/** Muscle scores and levels of a list of { exercise_id, sets }; exercises missing from the library count for nothing. */
export function draftMuscleLevels(
  exercises: readonly Pick<TemplateExerciseInput, 'exercise_id' | 'sets'>[],
  byId: ReadonlyMap<string, Pick<Exercise, 'primary_muscles' | 'secondary_muscles'>>,
): DraftTraining {
  const tagged = exercises.flatMap((e) => {
    const x = byId.get(e.exercise_id)
    return x ? [{ sets: e.sets, primary_muscles: x.primary_muscles, secondary_muscles: x.secondary_muscles }] : []
  })
  const scores = muscleScores(tagged)
  const totalSets = exercises.reduce((n, e) => n + e.sets, 0)
  const top = (Object.entries(scores) as [Muscle, number][])
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([m]) => m)
  const outsideRail = totalSets === 0 ? null : totalSets < SESSION_SETS.min ? 'under' : totalSets > SESSION_SETS.max ? 'over' : null
  return { scores, levels: muscleLevels(scores), totalSets, top, outsideRail }
}

/** Starting prescription: compound 3 × 6–10, 120 s rest; isolation (or unknown) 3 × 10–15, 60 s rest; no load yet. */
export function defaultPrescription(exercise: Pick<Exercise, 'id' | 'mechanic'>): TemplateExerciseInput {
  const compound = exercise.mechanic === 'compound'
  return {
    exercise_id: exercise.id,
    sets: 3,
    rep_min: compound ? 6 : 10,
    rep_max: compound ? 10 : 15,
    target_load_kg: null,
    rest_sec: compound ? 120 : 60,
    note: null,
  }
}
