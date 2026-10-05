// Owns: the typed exercise library API — the normalised free-exercise-db list and the naming helpers.
// Imports a ~1 MB JSON file: meant for scripts and the seed (the app reads exercises from D1 via /api), not for the web bundle.
// The naming helpers alone, without the JSON, are `@fitness/exercises/naming`.
import { library } from './lib/library'

// The value enums (ExerciseCategory, LibraryEquipment, Mechanic, Force, Level) live in @fitness/shared/schemas.
export { FreeExerciseDbRecord, type LibraryExercise } from './lib/library'
export { toSlug, videoSearchUrl } from './naming'
export { FREE_EXERCISE_DB_SHA } from './lib/source'
export { GIF_ATTRIBUTION, type LibraryMedia } from './lib/media'

/** Every library exercise, normalised (slug, typed muscles, '/exercises/<id>/<n>.jpg' image paths, video search link,
 *  and — for the ~460 with an ExerciseDB match — gif_url '/media/exercises/<id>.gif' plus `media` provenance; else null / []). */
export const exercises = library
