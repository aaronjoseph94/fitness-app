// Owns: the coach tools (SPEC §8 "Coach reviews through MCP", §10 review tools) — get_procedure, get_review_bundle,
// apply_review, revert_review, set_dashboard_note, schedule_scan (the coach module). Week-plan tools live in their own
// set. apply_review and revert_review are for the coach through the connector (403 for Ask AI).
import { Id } from '@fitness/shared/schemas'
import * as z from 'zod'
import {
  ApplyReviewInput,
  ApplyReviewResult,
  applyReview,
  BundleQuery,
  DashboardNote,
  DashboardNoteInput,
  RevertReviewResult,
  ReviewBundle,
  reviewBundle,
  revertReview,
  ScanDateInput,
  ScanScheduled,
  scheduleScan,
  setDashboardNote,
} from '../../../coach'
import { defineTool, type ToolDefinition } from '../define'
import { getProcedure, PROCEDURE_NAMES } from '../procedures'

const START = 'For a weekly review, call get_procedure("coach_review") first.'

export const COACH_TOOLS: readonly ToolDefinition[] = [
  defineTool({
    name: 'get_procedure',
    title: 'Get a coach procedure',
    area: 'coach',
    description:
      "The step-by-step procedure for a coaching task: coach_review (the weekly review, ending with next week's plan), scan_debrief (after a confirmed Evolt scan), program_design (build or rebuild the Mon–Thu training plan), plateau_check (is the trend really stuck). Call it before starting one of those tasks and follow it: what to read, what to check, what may change, how to present before applying. Read-only.",
    input: z.object({ name: z.enum(PROCEDURE_NAMES) }),
    output: z.object({
      name: z.enum(PROCEDURE_NAMES),
      title: z.string(),
      description: z.string(),
      text: z.string(),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    run: async (_deps, { name }) => getProcedure(name),
  }),
  defineTool({
    name: 'get_review_bundle',
    title: 'Get the review bundle',
    area: 'coach',
    description: `${START} One compact JSON (aggregates only, about 10–20 KB) with everything a coach needs for a period: profile and rails, the active plan and forecast with recent versions, weekly aggregates (trend change, intake and macros vs targets, protein adherence, water, steps, sleep, sessions done vs planned, volume), period totals, volume per muscle against the block before, PRs, fasts, tape, the latest scan with the lean-loss guard, milestones, open proposals, upcoming fasts / scan date / week plans, the dashboard note, safety flags, equipment limits and templates. No arguments = the review week (this week on Sat/Sun, last week Mon–Fri); at most 56 days. Read-only.`,
    input: BundleQuery,
    output: ReviewBundle,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    run: (deps, q) => reviewBundle(deps, q),
  }),
  defineTool({
    name: 'apply_review',
    title: 'Apply a coach review',
    area: 'coach',
    description: `${START} Apply a weekly review Aaron approved in this chat, as one unit: every target change becomes ONE new plan version; templates, exercise swaps, training days, equipment statuses, reminder times, milestones, planned fasts, the next scan date and the dashboard note apply through the app's own checks; and the review (summary, narrative, highlights, concerns) is recorded for that week, replacing the AI draft in the printed report. Guards: kcal stays within the calorie floor and ceiling and moves at most 150 now (bigger moves continue as weekly pending steps), protein and fat at or above their minimums, allowed exercises only, 12–28 sets per session, two fasts a month. A change that fails a rail is dropped and reported with its rule; the rest applies. The rails themselves can never be changed. Returns the new plan version id, the diff, what applied, what was dropped, and the review_id for revert_review.`,
    input: ApplyReviewInput,
    output: ApplyReviewResult,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: (deps, input) => applyReview(deps, input),
  }),
  defineTool({
    name: 'revert_review',
    title: 'Revert a coach review',
    area: 'coach',
    description:
      'Undo a review applied with apply_review, in one call, when Aaron asks: the plan goes back to the version that was active before it (as a new version; plan changes made after the review are undone too and counted), and its other changes are undone where possible (settings and equipment restored, milestones removed, planned fasts cancelled or moved back, scan date and dashboard note cleared). Templates it created are kept. Running it twice is harmless.',
    input: z.object({
      review_id: Id.describe('The review_id apply_review returned (also the review id in list_reviews)'),
    }),
    output: RevertReviewResult,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, { review_id }) => revertReview(deps, review_id),
  }),
  defineTool({
    name: 'set_dashboard_note',
    title: 'Pin a dashboard note',
    area: 'coach',
    description:
      'Pin a short coach note to the top of the Today tab (e.g. this week\'s focus: "Protein first; Thursday is a fast day, keep it light"), until an Edmonton date (inclusive) or until a newer note replaces it. Keep it to one or two sentences; no medical advice.',
    input: DashboardNoteInput,
    output: DashboardNote,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: (deps, input) => setDashboardNote(deps, input),
  }),
  defineTool({
    name: 'schedule_scan',
    title: 'Schedule the next scan',
    area: 'coach',
    description:
      'Set the date of the next Evolt 360 scan (today or later; every 4 weeks by default, morning, fasted, no training the day before). It shows on the dashboard feed and in the review bundle; returns the next scan as the app now sees it and the interval date for comparison.',
    input: ScanDateInput,
    output: ScanScheduled,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, { date }) => scheduleScan(deps, date),
  }),
]
