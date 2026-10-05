// Owns: weekly reviews (SPEC §8 "Weekly review and printable summary", §9 weekly_review) — the engine's week metrics,
// the Gemini draft (skipped when Claude reviewed the week), the reviews list, and the archived PDF.
// Interface:
//   buildWeeklyMetrics(deps, week_start)   → WeeklyMetrics   engine aggregate of Monday week_start … Sunday (v_day +
//        trend, sessions, PRs, fasts, scan deltas, forecast, safety flags)
//   weekMetrics(deps, week)                → WeeklyMetrics   the same by ISO week key ("2026-W40"; 400 if no such week)
//   draftWeeklyReview(deps, llm, week_start) → DraftOutcome  the weekly_review job's work with the router passed in:
//        skipped when a Claude review (author claude_mcp) exists; else writes the Gemini review (a redraft replaces the
//        earlier Gemini draft and withdraws its pending proposals), proposals through plan.propose as actor 'ai', and one
//        ai_events 'review'. A router failure still writes the review (engine narrative, no proposals).
//   requestWeeklyReview(deps, week)        → { job_id } | { skipped: 'claude_review' }   queue the job and run it soon
//   weeklyReviewHook(deps, week)           → the cron's Sunday 20:00 call (the ISO week ending that Sunday)
//   recordCoachReview(deps, { week_start, narrative, highlights?, concerns?, proposals? }) → WeeklyReview   Claude's
//        review (MCP apply_review) supersedes the Gemini draft: same row, author claude_mcp, the draft's pending
//        proposals withdrawn, one ai_events 'review' as deps.actor
//   listReviews(deps) / getReview(deps, week)  → WeeklyReview[] newest first / one (404 when none)
//   archiveReviewPdf(deps, week)           → PdfOutcome      Browser Rendering → R2 reports/<week>.pdf → signed link;
//        { ok: false, status: 501, error: 'pdf_unavailable' } without the BROWSER binding (local dev)
// Registers the 'weekly_review' job handler (one router per run, at most LLM_FETCHES external fetches).
import type { WeeklyMetrics, WeeklyReview } from '@fitness/shared/schemas'
import { desc } from 'drizzle-orm'
import { weekly_reviews } from '../../db'
import type { Deps } from '../../lib/deps'
import { notFound } from '../../lib/http-error'
import { enqueue, registerJobHandler, runSoon } from '../jobs'
import { createLlmRouter, type LlmRouter } from '../llm'
import { recordCoachReview, type CoachReviewInput } from './lib/coach'
import { draftReview, findReviewRow, type DraftOutcome } from './lib/draft'
import { buildWeeklyMetrics } from './lib/metrics'
import { archivePdf, type PdfOutcome } from './lib/pdf'
import { proposalStatuses, readReview, storedProposals, toReview, weekStartOf } from './lib/rows'

export { buildWeeklyMetrics, recordCoachReview }
export type { CoachReviewInput, DraftOutcome, PdfOutcome }

/** External fetches one weekly_review run may make (router retries and failovers included). */
const LLM_FETCHES = 8
/** Router deadline, leaving the rest of the job's 25 s for the reads and the write. */
const LLM_DEADLINE_MS = 18_000

export function weekMetrics(deps: Deps, week: string): Promise<WeeklyMetrics> {
  return buildWeeklyMetrics(deps, weekStartOf(week))
}

export function draftWeeklyReview(deps: Deps, llm: LlmRouter, week_start: string): Promise<DraftOutcome> {
  return draftReview(deps, llm, week_start)
}

/** Queue the weekly_review job for a week (Sunday cron, or Aaron's "Draft review"); skipped when Claude reviewed it. */
export async function requestWeeklyReview(deps: Deps, week: string): Promise<{ job_id: string } | { skipped: 'claude_review' }> {
  const week_start = weekStartOf(week)
  const existing = await findReviewRow(deps, week_start)
  if (existing?.author === 'claude_mcp') return { skipped: 'claude_review' }
  const job = await enqueue(deps, { type: 'weekly_review', payload: { week_start } })
  runSoon(deps, job.id)
  return { job_id: job.id }
}

/** The cron's weekly hook: Sunday ≥ 20:00 Edmonton, once per ISO week; reviews the week ending that Sunday. */
export async function weeklyReviewHook(deps: Deps, week: string): Promise<void> {
  const result = await requestWeeklyReview(deps, week)
  console.log(JSON.stringify({ level: 'info', msg: 'weekly review', week, ...result }))
}

export async function listReviews(deps: Deps): Promise<WeeklyReview[]> {
  const rows = await deps.db.select().from(weekly_reviews).orderBy(desc(weekly_reviews.week_start))
  const statuses = await proposalStatuses(deps, rows.flatMap((r) => storedProposals(r).flatMap((p) => (p.event_id ? [p.event_id] : []))))
  const reviews = await Promise.all(rows.map((r) => toReview(deps, r, statuses)))
  return reviews.filter((r): r is WeeklyReview => r !== null)
}

export async function getReview(deps: Deps, week: string): Promise<WeeklyReview> {
  const row = await findReviewRow(deps, weekStartOf(week))
  const review = row && (await readReview(deps, row))
  if (!review) throw notFound(`Review for ${week}`)
  return review
}

export function archiveReviewPdf(deps: Deps, week: string): Promise<PdfOutcome> {
  return archivePdf(deps, { week, week_start: weekStartOf(week) })
}

registerJobHandler('weekly_review', {
  fetches: LLM_FETCHES,
  run: async (deps, job) => {
    const llm = createLlmRouter(deps, { budget: { limit: LLM_FETCHES, used: 0 }, deadlineMs: LLM_DEADLINE_MS })
    const outcome = await draftReview(deps, llm, job.payload.week_start)
    const meta = outcome.status === 'written' && outcome.meta ? outcome.meta : undefined
    return {
      output: outcome.output,
      meta: meta && { provider: meta.provider, model: meta.model, tokens_in: meta.tokens_in, tokens_out: meta.tokens_out },
    }
  },
})
