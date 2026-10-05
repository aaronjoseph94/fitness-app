// Owns: weekly reviews — the week's aggregated metrics (engine, from v_day + sessions + fasts + scans), narrative,
// highlights, concerns, proposals with their status, and the archived PDF; plus the review endpoints' small bodies.
import * as z from 'zod'
import { Count, Fraction, Grams, Id, Instant, IsoWeek, Kcal, Kg, LocalDate, Minutes, Ml, Row } from './common'
import { FileUrl } from './files'
import { Nutrients } from './nutrition'
import { Forecast, PlanChange, ProposalStatus } from './plan'
import { ScanSegment } from './scans'
import { MuscleScores, PersonalRecord, VolumeKg } from './training'

export const ReviewAuthor = z.enum(['claude_mcp', 'gemini'])
export type ReviewAuthor = z.infer<typeof ReviewAuthor>

/** How one fast of the week went (completed at ≥ 95 % of settings.fast_hours). */
export const FastOutcome = z.object({
  fast_id: Id,
  started_at: Instant,
  ended_at: Instant.nullable(),
  hours: z.number().nonnegative(),
  status: z.enum(['completed', 'partial', 'active']),
})
export type FastOutcome = z.infer<typeof FastOutcome>

/** A PR set in the week, with the exercise's name for the report. */
export const ReviewPr = PersonalRecord.extend({ exercise_name: z.string() })
export type ReviewPr = z.infer<typeof ReviewPr>

/** A safety flag (SPEC §3) as of the week's Sunday, or the lean-loss guard of a scan that fell in the week. */
export const ReviewFlag = z.object({
  kind: z.enum(['rapid_loss', 'plateau', 'protein_low', 'low_steps_stalled', 'lean_loss']),
  message: z.string(),
})
export type ReviewFlag = z.infer<typeof ReviewFlag>

const FromTo = z.object({ from: z.number(), to: z.number() })

/** A confirmed scan that fell in the week, compared with the previous confirmed scan (engine compareScans). */
export const ReviewScanDelta = z.object({
  scan_id: Id,
  date: LocalDate,
  previous_scan_id: Id,
  previous_date: LocalDate,
  days: Count,
  /** Signed kg changes (this scan − previous). */
  fat_vs_lean: z.object({ weight_kg: z.number(), fat_kg: z.number(), lean_kg: z.number(), water_kg: z.number() }),
  body_fat_pct: FromTo.nullable(),
  visceral_fat_level: FromTo.nullable(),
  /** lean lost / weight lost (null when no weight was lost). */
  lean_share_of_loss: z.number().nullable(),
  /** The lean-loss guard: lean > 25 % of the loss is flagged, unless a matching water drop makes it hydration. */
  lean_loss: z.enum(['ok', 'lean_loss', 'hydration']),
  segments: z.array(z.object({ segment: ScanSegment, fat_from: Kg, fat_to: Kg, lean_from: Kg, lean_to: Kg })),
  /** Labels of composition milestones this scan reached. */
  milestones_reached: z.array(z.string()),
})
export type ReviewScanDelta = z.infer<typeof ReviewScanDelta>

/** The engine's aggregate of one Monday–Sunday week (SPEC §8 weekly review). */
export const WeeklyMetrics = z.object({
  week: IsoWeek,
  week_start: LocalDate,
  /** trend(Sunday before) (or trend(Monday) when that is missing); trend(Sunday); change = end − start. */
  trend_start_kg: Kg.nullable(),
  trend_end_kg: Kg.nullable(),
  trend_change_kg: z.number().nullable(),
  /** Mean over days with logged intake (fast days count as 0 kcal). */
  intake_avg: Nutrients,
  /** Mean daily kcal and protein targets over the week's non-fast days (null without targets). */
  target_kcal_avg: Kcal.nullable(),
  target_protein_g: Grams.nullable(),
  days_logged: Count.max(7),
  /** Share of logged non-fast days with protein at or above target. */
  protein_adherence: Fraction,
  water_avg_ml: Ml,
  steps_avg: Count.nullable(),
  sleep_avg_min: Minutes.nullable(),
  sessions_done: Count,
  sessions_planned: Count,
  /** Muscle score per muscle, Σ sets × (1.0 primary, 0.5 secondary) — what the muscle map draws. */
  muscle_scores: MuscleScores,
  /** Volume per muscle, Σ reps × load × (1.0 primary, 0.5 secondary), kg. */
  volume_by_muscle: MuscleScores,
  /** Σ reps × load over completed sets, kg. */
  volume_kg: VolumeKg,
  prs: z.array(ReviewPr),
  fasts: z.array(FastOutcome),
  /** Share of days with a weigh-in, at least two meals or a fast, and water logged. */
  logging_adherence: Fraction,
  /** The active plan's forecast when the metrics were built. */
  forecast: Forecast.nullable(),
  flags: z.array(ReviewFlag),
  scan: ReviewScanDelta.nullable(),
})
export type WeeklyMetrics = z.infer<typeof WeeklyMetrics>

/**
 * A review's proposal with where it ended up: `pending`/`accepted`/… from its ai_events row (event_id), or `rejected`
 * with event_id null when a guard dropped it. `note` says why it was dropped, or which step of a split move it is.
 */
export const ReviewProposal = PlanChange.extend({ status: ProposalStatus, event_id: Id.nullable(), note: z.string().nullable() })
export type ReviewProposal = z.infer<typeof ReviewProposal>

/** One week's review. A Claude review supersedes the Gemini draft for the same week (one row per week_start). */
export const WeeklyReview = Row.extend({
  week: IsoWeek,
  week_start: LocalDate,
  author: ReviewAuthor,
  metrics: WeeklyMetrics,
  narrative: z.string(),
  highlights: z.array(z.string()),
  concerns: z.array(z.string()),
  proposals: z.array(ReviewProposal),
  /** Signed link to the archived PDF (reports/<week>.pdf), when one was saved. */
  pdf_url: FileUrl.nullable(),
})
export type WeeklyReview = z.infer<typeof WeeklyReview>
