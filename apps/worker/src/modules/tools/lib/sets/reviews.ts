// Owns: the review tools — get_weekly_review, list_reviews (the reviews module: weekly metrics, narrative and
// proposals per Monday–Sunday week; a Claude review supersedes the AI draft).
import { Count, Id, IsoWeek, LocalDate, WeeklyReview } from '@fitness/shared/schemas'
import * as z from 'zod'
import { notFound } from '../../../../lib/http-error'
import { getReview, listReviews } from '../../../reviews'
import { defineTool, type ToolDefinition } from '../define'

const ReviewBrief = z.object({
  id: Id,
  week: IsoWeek,
  week_start: LocalDate,
  /** 'gemini' is the shared id for a review the AI wrote, whichever model the router picked — never a provider name. */
  author: z.enum(['claude_mcp', 'gemini']),
  trend_change_kg: z.number().nullable(),
  intake_kcal_avg: z.number(),
  protein_adherence: z.number(),
  sessions: z.string(),
  flags: z.array(z.string()),
  narrative_start: z.string(),
  proposals: Count,
})

export const REVIEW_TOOLS: readonly ToolDefinition[] = [
  defineTool({
    name: 'get_weekly_review',
    title: 'Get a weekly review',
    area: 'reviews',
    description:
      "One week's review (ISO week such as 2026-W40; default the newest): the engine's weekly metrics (trend change, intake and macro averages vs targets, protein adherence, water, steps, sleep, sessions done vs planned, volume and muscle scores, PRs, fasts, logging adherence, forecast, safety flags, scan deltas), the narrative, highlights, concerns and its proposals with their current status. author is claude_mcp when a coach review replaced the AI draft (author 'gemini', the shared id for an AI-written review). Read-only.",
    input: z.object({ week: IsoWeek.optional() }),
    output: WeeklyReview,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    run: async (deps, { week }) => {
      if (week) return getReview(deps, week)
      const [latest] = await listReviews(deps)
      if (!latest) throw notFound('Weekly review')
      return latest
    },
  }),
  defineTool({
    name: 'list_reviews',
    title: 'List weekly reviews',
    area: 'reviews',
    description:
      'Past weekly reviews, newest first, one line each: week, author, trend change, average kcal, protein adherence, sessions, flags and the start of the narrative. Read-only.',
    input: z.object({ limit: z.number().int().min(1).max(52).default(12) }),
    output: z.object({ reviews: z.array(ReviewBrief), total: Count }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    run: async (deps, { limit }) => {
      const reviews = await listReviews(deps)
      return {
        total: reviews.length,
        reviews: reviews.slice(0, limit).map((r) => ({
          id: r.id,
          week: r.week,
          week_start: r.week_start,
          author: r.author,
          trend_change_kg: r.metrics.trend_change_kg,
          intake_kcal_avg: r.metrics.intake_avg.kcal,
          protein_adherence: r.metrics.protein_adherence,
          sessions: `${r.metrics.sessions_done}/${r.metrics.sessions_planned}`,
          flags: r.metrics.flags.map((f) => f.kind),
          narrative_start: r.narrative.length > 200 ? `${r.narrative.slice(0, 199)}…` : r.narrative,
          proposals: r.proposals.length,
        })),
      }
    },
  }),
]
