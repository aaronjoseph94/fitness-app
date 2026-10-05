// Owns: weekly reviews — the week's aggregated metrics (from v_day), narrative, highlights, concerns, proposals
// with their status, and the archived PDF.
import * as z from 'zod'
import { Count, Fraction, Id, Instant, Kg, LocalDate, Minutes, Ml, Row } from './common'
import { FileUrl } from './files'
import { Nutrients } from './nutrition'
import { Forecast, PlanChange, ProposalStatus } from './plan'
import { MuscleScores, PersonalRecord } from './training'

export const ReviewAuthor = z.enum(['claude_mcp', 'gemini'])
export type ReviewAuthor = z.infer<typeof ReviewAuthor>

/** How one fast of the week went. */
export const FastOutcome = z.object({
  fast_id: Id,
  started_at: Instant,
  ended_at: Instant.nullable(),
  hours: z.number().nonnegative(),
  status: z.enum(['completed', 'partial', 'active']),
})
export type FastOutcome = z.infer<typeof FastOutcome>

/** The engine's aggregate of one Monday–Sunday week, computed from v_day. */
export const WeeklyMetrics = z.object({
  week_start: LocalDate,
  trend_start_kg: Kg.nullable(),
  trend_end_kg: Kg.nullable(),
  trend_change_kg: z.number().nullable(),
  /** Mean over days with logged intake (fast days count as 0 kcal). */
  intake_avg: Nutrients,
  days_logged: Count.max(7),
  /** Share of days with protein at or above target. */
  protein_adherence: Fraction,
  water_avg_ml: Ml,
  steps_avg: Count.nullable(),
  sleep_avg_min: Minutes.nullable(),
  sessions_done: Count,
  sessions_planned: Count,
  volume_by_muscle: MuscleScores,
  prs: z.array(PersonalRecord),
  fasts: z.array(FastOutcome),
  /** Share of days with a weigh-in, at least two meals or a fast, and water logged. */
  logging_adherence: Fraction,
  forecast: Forecast.nullable(),
})
export type WeeklyMetrics = z.infer<typeof WeeklyMetrics>

/** A review's proposal with where it ended up. */
export const ReviewProposal = PlanChange.extend({ status: ProposalStatus, event_id: Id.nullable() })
export type ReviewProposal = z.infer<typeof ReviewProposal>

/** One week's review. A Claude review supersedes the Gemini draft for the same week. */
export const WeeklyReview = Row.extend({
  week_start: LocalDate,
  author: ReviewAuthor,
  metrics: WeeklyMetrics,
  narrative: z.string(),
  highlights: z.array(z.string()),
  concerns: z.array(z.string()),
  proposals: z.array(ReviewProposal),
  pdf_url: FileUrl.nullable(),
})
export type WeeklyReview = z.infer<typeof WeeklyReview>
