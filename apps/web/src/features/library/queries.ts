// Owns: the exercise library read's input and freshness (GET /api/exercises?scope=all), shared by useExercises. A second
// entry point of the library module: light, no UI.

/** GET /api/exercises?scope=all: the whole library, allowed and not. */
export const ALL_EXERCISES = { query: { scope: 'all' as const } }

/** The list rarely changes (equipment and exclusion edits mark it stale): ten minutes between reads. */
export const EXERCISES_STALE_MS = 10 * 60_000
