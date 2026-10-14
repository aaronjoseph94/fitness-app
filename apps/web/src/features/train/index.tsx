// Owns: the training tab module (SPEC §7, §11) — its public surface: the Train tab (the date, readiness chip and blank
// session as its title row, today's session, the "This week" card that picks the training days and drafts the split,
// templates with mini muscle maps and the split's AI drafts, recent sessions with this week's totals, and a row of four
// tool cards into the library, equipment, builder and AI workouts) and the session page (/train/session/:id: the logger
// with last session greyed, progression defaults and offline set saving, then the finish summary with
// muscle map, volume per muscle, PRs and "Save as template"; a finished session can be edited (back into the logger)
// and any session deleted). Implementation lives in ./lib. Second entry point: ./queries (the reads' inputs).
export { TrainPage } from './lib/TrainPage'
export { SessionPage } from './lib/SessionPage'
