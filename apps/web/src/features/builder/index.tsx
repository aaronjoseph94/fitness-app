// Owns: the workout builder module (SPEC §7) — its public surface: the BuilderPage (create / edit / duplicate a
// template with a live muscle map and "Fill with AI"), the AiWorkoutPage (generate a session), the AiWorkoutPreview
// (muscle map, rationale, swap, start or save) and the AI workout job hook. Implementation lives in ./lib.
export { BuilderPage } from './lib/BuilderPage'
export { AiWorkoutPage } from './lib/AiWorkoutPage'
export { AiWorkoutPreview, type AiWorkoutPreviewProps, type WorkoutSwap } from './lib/AiWorkoutPreview'
export { useAiWorkout, type AiWorkoutState } from './lib/useAiWorkout'
export { draftMuscleLevels } from './lib/scores'
