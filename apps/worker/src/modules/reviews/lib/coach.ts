// Owns: recording Claude's weekly review (the Coach, through MCP apply_review) — it supersedes the AI draft for
// that week: same weekly_reviews row (author claude_mcp, fresh metrics, Claude's words), the draft's still-pending
// proposals withdrawn, the archived PDF cleared (it showed the draft), and one ai_events 'review' as actor deps.actor.
import { addDays, isoWeek } from '@fitness/shared/engine'
import type { ReviewProposal, WeeklyReview } from '@fitness/shared/schemas'
import { weekly_reviews } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { eventInsert, proposalDecisionUpdate } from '../../events'
import { findReviewRow } from './draft'
import { buildWeeklyMetrics } from './metrics'
import { proposalStatuses, readReview, storedProposals } from './rows'

export interface CoachReviewInput {
  week_start: string
  narrative: string
  highlights?: string[]
  concerns?: string[]
  /** What the review changed and where each change ended up (e.g. auto_applied with its event, or rejected by a guard). */
  proposals?: ReviewProposal[]
}

export async function recordCoachReview(deps: Deps, input: CoachReviewInput): Promise<WeeklyReview> {
  const { week_start } = input
  const [existing, metrics] = await Promise.all([findReviewRow(deps, week_start), buildWeeklyMetrics(deps, week_start)])
  const ownIds = new Set((input.proposals ?? []).flatMap((p) => (p.event_id ? [p.event_id] : [])))
  const draftPending = existing?.author === 'gemini' ? storedProposals(existing).flatMap((p) => (p.event_id && !ownIds.has(p.event_id) ? [p.event_id] : [])) : []
  const statuses = draftPending.length ? await proposalStatuses(deps, draftPending) : new Map()
  const withdraw = draftPending.filter((id) => statuses.get(id) === 'pending').map((id) => proposalDecisionUpdate(deps, id, { status: 'rejected' }))

  const now = deps.now().toISOString()
  const id = existing?.id ?? crypto.randomUUID()
  const fields = {
    metrics,
    narrative: input.narrative,
    author: 'claude_mcp' as const,
    proposals: input.proposals ?? [],
    highlights: input.highlights ?? [],
    concerns: input.concerns ?? [],
    pdf_path: null,
    updated_at: now,
  }
  const event = eventInsert(deps, {
    kind: 'review',
    summary: `Coach review ${isoWeek(week_start)}`,
    body: { review_id: id, week_start },
    date: addDays(week_start, 6),
  })
  await deps.db.batch([
    deps.db
      .insert(weekly_reviews)
      .values({ id, week_start, ...fields, created_at: now })
      .onConflictDoUpdate({ target: weekly_reviews.week_start, set: fields }),
    event.statement,
    ...withdraw,
  ])
  const row = await findReviewRow(deps, week_start)
  const review = row && (await readReview(deps, row))
  if (!review) throw new Error(`coach review for ${week_start} was written but cannot be read back`)
  return review
}
