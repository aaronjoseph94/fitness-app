// Owns: the workout builder module (SPEC §7) — its public surface: the BuilderPage (create / edit / duplicate a
// template with a live muscle map and "Fill with AI"), the AiWorkoutPage (generate a session, then preview, swap,
// start or save it), a draft's muscle levels, and the pending AI drafts (a split day's or the nightly one, or the
// draft any one workout proposal carries) with the AI page's link to one. Implementation lives in ./lib.
export { BuilderPage } from './lib/BuilderPage'
export { AiWorkoutPage } from './lib/AiWorkoutPage'
export { draftMuscleLevels } from './lib/scores'
export {
  usePendingWorkouts,
  pendingWorkoutOf,
  pendingWorkoutPath,
  type PendingWorkout,
} from './lib/pending-workout'
