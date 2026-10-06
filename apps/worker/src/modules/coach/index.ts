// Owns: the coach module's interface — the judgement-work side of the app that Claude (the Coach, through MCP) uses
// (SPEC §8 "Coach reviews through MCP", §10 review tools). Everything here goes through the other modules' guarded
// entry points; nothing changes a settings rail.
// Interface:
//   reviewBundle(deps, { from?, to? })      → ReviewBundle        get_review_bundle: one compact JSON (≈10–20 KB) of
//        aggregates for ≤ 56 days (default: the review week) — weekly metrics as in the weekly report, totals,
//        training vs the block before, scan + lean-loss guard, open proposals, upcoming fasts/scan/week plans, flags
//   applyReview(deps, ApplyReviewInput)     → ApplyReviewResult   apply_review: target changes → ONE plan version;
//        other changes through their modules; a change that fails a rail is dropped and reported, the rest applies;
//        the review recorded via reviews.recordCoachReview (Claude's narrative replaces the AI draft's), or with
//        record_review false (scan debrief, program design, plateau check) kept as a note; 403 for actor 'ai'
//   revertReview(deps, review_id)           → RevertReviewResult  revert_review: the plan version from before the
//        review restored, the other changes undone where possible; idempotent; 403 for actor 'ai'
//   setDashboardNote(deps, { text, until? }) → DashboardNote      pin a note to the top of Today
//   scheduleScan(deps, date | null)          → ScanScheduled      set (or clear) the next Evolt scan date
//   nextScan(deps)                           → NextScan           the scheduled date, else last scan + interval
//   queryMetric(deps, MetricQuery)           → MetricSeries       read-only day/week series of one metric
//   localInstant(date, time?)                → UTC instant of an Edmonton wall-clock time (tools reuse it)
//   reviewWeekStart(now)                     → Monday of the week a review run now covers (Sat/Sun this week, else last)
//   assertCoach(deps, what)                  → throws 403 needs_approval for actor 'ai' (Ask AI proposes instead)
// Schemas (Zod, reused as tool input/output): BundleQuery, ReviewBundle, ReviewChange, ApplyReviewInput,
// ApplyReviewResult, RevertReviewResult, DashboardNoteInput, ScanDateInput, NextScan, ScanScheduled, MetricQuery,
// MetricSeries, MetricName.
export { applyReview, assertCoach, DEFAULT_FAST_TIME } from './lib/apply'
export { reviewBundle } from './lib/bundle'
export { queryMetric } from './lib/metrics'
export { setDashboardNote } from './lib/note'
export { revertReview } from './lib/revert'
export { nextScan, scheduleScan } from './lib/scan-date'
export {
  ApplyReviewInput,
  ApplyReviewResult,
  BundleQuery,
  DashboardNote,
  DashboardNoteInput,
  MetricName,
  MetricQuery,
  MetricSeries,
  NextScan,
  RevertReviewResult,
  ReviewBundle,
  ReviewChange,
  ScanDateInput,
  ScanScheduled,
} from './lib/schemas'
export { localInstant, reviewWeekStart } from './lib/time'
