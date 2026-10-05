// Owns: the training tab module (SPEC §7, §11) — its public surface: the Train tab (today's session, readiness,
// templates with mini muscle maps, recent sessions, links to the library, equipment, builder and AI workouts) and the
// session page (/train/session/:id: the logger with last session greyed, progression defaults, rest timer and offline
// set saving, then the finish summary with muscle map, volume per muscle, PRs and "Save as template"; a finished
// session can be edited (back into the logger) and any session deleted).
// Implementation lives in ./lib. Second entry point: ./queries (the reads' inputs).
export { TrainPage } from './lib/TrainPage'
export { SessionPage } from './lib/SessionPage'
export { sessionPath, useStartSession, type StartInput } from './lib/session'
