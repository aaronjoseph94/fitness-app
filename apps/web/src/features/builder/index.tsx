// Owns: the workout builder module (SPEC §7) — its public surface: the BuilderPage (create / edit / duplicate a
// template with a live muscle map and "Fill with AI"), the AiWorkoutPage (generate a session), the AiWorkoutPreview
// (muscle map, rationale, swap, start or save), the AI workout job hook, and the pending AI drafts (the nightly one
// included) with the AI page's link to one. Implementation lives in ./lib.
export { BuilderPage } from './lib/BuilderPage'
export { AiWorkoutPage } from './lib/AiWorkoutPage'
export { AiWorkoutPreview, type AiWorkoutPreviewProps, type WorkoutSwap } from './lib/AiWorkoutPreview'
export { useAiWorkout, type AiWorkoutState } from './lib/useAiWorkout'
export { draftMuscleLevels } from './lib/scores'
export { usePendingWorkouts, pendingWorkoutPath, type PendingWorkout } from './lib/pending-workout'
