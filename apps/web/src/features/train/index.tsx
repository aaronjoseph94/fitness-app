// Owns: the training tab module (SPEC §7, §11) — its public surface: the Train tab (today's session, readiness,
// templates with mini muscle maps, recent sessions, links to the library, equipment, builder and AI workouts) and the
// session page (/train/session/:id: the logger with last session greyed, progression defaults, rest timer and offline
// set saving, then the finish summary with muscle map, volume per muscle, PRs and "Save as template").
// Implementation lives in ./lib.
export { TrainPage } from './lib/TrainPage'
export { SessionPage } from './lib/SessionPage'
export { sessionPath, useStartSession, type StartInput } from './lib/session'
