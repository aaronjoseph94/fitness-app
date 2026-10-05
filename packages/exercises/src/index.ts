// Owns: the typed exercise library API — the normalised free-exercise-db list and small lookup helpers.
// Imports a ~1 MB JSON file: meant for scripts and the seed (the app reads exercises from D1 via /api), not for the web bundle.
import type { Muscle } from '@fitness/shared/schemas'
import { library, type LibraryExercise } from './lib/library'

// The value enums (ExerciseCategory, LibraryEquipment, Mechanic, Force, Level) live in @fitness/shared/schemas.
export { FreeExerciseDbRecord, toSlug, videoSearchUrl, type LibraryExercise } from './lib/library'
export { FREE_EXERCISE_DB_SHA } from './lib/source'

/** Every library exercise, normalised (slug, typed muscles, '/exercises/<id>/<n>.jpg' image paths, video search link). */
export const exercises = library

/** Exercises that train `muscle` as a primary target (or as primary or secondary with `{ secondary: true }`). */
export function byMuscle(
  muscle: Muscle,
  options: { secondary?: boolean; from?: readonly LibraryExercise[] } = {},
): LibraryExercise[] {
  const { secondary = false, from = exercises } = options
  return from.filter(
    (e) => e.primary_muscles.includes(muscle) || (secondary && e.secondary_muscles.includes(muscle)),
  )
}

/** Bodyweight-only: equipment 'body only' (or missing, as on a custom exercise without equipment). Excluded by default. */
export function isBodyOnly(exercise: { equipment: string | null }): boolean {
  return exercise.equipment === null || exercise.equipment === 'body only'
}
