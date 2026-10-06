// Owns: writing the AI's review for one week (the weekly_review job's work, SPEC §8–9) — skip when Claude already
// reviewed the week; otherwise metrics → router.complete (WeeklyReviewOutput) → proposals through the plan's guards
// (floor, ceiling, ≤150 kcal per step, later steps scheduled a week apart) → the earlier draft's pending proposals
// withdrawn, the new proposals, the weekly_reviews row and one ai_events 'review', ALL in one batch (a deadline
// requeue redrafts cleanly, never leaving a second set pending) → next week's plan stored as a proposed AI draft
// (week-plans module) with the current targets carried forward unchanged: a proposal reaches that week once, through
// the plan version accepting it makes (carried into the week plan), never also baked into the draft.
// When the router fails the week still gets a review: metrics plus an engine-written narrative, no proposals.
import { addDays, isoWeek } from '@fitness/shared/engine'
import {
  WeeklyReviewOutput,
  type PlanChange,
  type ReviewProposal,
  type WeeklyReview,
  type WeekPlanContent,
} from '@fitness/shared/schemas'
import { eq, sql } from 'drizzle-orm'
import { runBatch, weekly_reviews } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { eventInsert, proposalDecisionUpdate } from '../../events'
import { fastDaysIn } from '../../fasting'
import type { CallMeta, LlmRouter } from '../../llm'
import { getActivePlan, proposalStatements, type ProposalStatements } from '../../plan'
import { getSettings } from '../../settings'
import { proposeWeekPlan } from '../../week-plans'
import { buildWeeklyMetrics } from './metrics'
import { carryForwardPlan, engineReview } from './narrative'
import { reviewMessage, SYSTEM_PROMPT } from './prompt'
import { proposalStatuses, readReview, storedProposals, type ReviewRow } from './rows'

const MAX_LIST = 8
const MAX_ITEM = 300
const MAX_NARRATIVE = 4000
const MAX_TOKENS = 3000

export type DraftOutcome =
  | { status: 'skipped'; reason: 'claude_review'; review: WeeklyReview | null; output: WeeklyReviewOutput }
  | { status: 'written'; source: 'llm' | 'engine'; review: WeeklyReview; output: WeeklyReviewOutput; meta: CallMeta | null }

export async function findReviewRow(deps: Deps, week_start: string): Promise<ReviewRow | null> {
  const [row] = await deps.db.select().from(weekly_reviews).where(eq(weekly_reviews.week_start, week_start))
  return row ?? null
}

const clip = (xs: readonly string[]) => xs.slice(0, MAX_LIST).map((x) => x.slice(0, MAX_ITEM))

/** The week's review by the Clerk. Proposals and the review are written as actor 'ai' whoever asked for the draft. */
export async function draftReview(deps: Deps, llm: LlmRouter, week_start: string): Promise<DraftOutcome> {
  const ai: Deps = { ...deps, actor: 'ai' }
  const next_start = addDays(week_start, 7)
  const [existing, metrics, settingsView, plan, nextFasts] = await Promise.all([
    findReviewRow(ai, week_start),
    buildWeeklyMetrics(ai, week_start),
    getSettings(ai),
    getActivePlan(ai),
    fastDaysIn(ai, { from: next_start, to: addDays(next_start, 6) }),
  ])
  // Fast days (engine fastDay: one date per fast), which a week plan's fast_dates mirror.
  const fastDates = [...new Set(nextFasts.map((f) => f.date))].sort()
  const fallbackPlan = (): WeekPlanContent => carryForwardPlan(plan.targets, fastDates)

  if (existing?.author === 'claude_mcp') {
    const review = await readReview(ai, existing)
    return {
      status: 'skipped',
      reason: 'claude_review',
      review,
      output: {
        narrative: (review?.narrative ?? '').slice(0, MAX_NARRATIVE),
        highlights: clip(review?.highlights ?? []),
        concerns: clip(review?.concerns ?? []),
        proposals: [],
        week_plan: fallbackPlan(),
      },
    }
  }

  let output: WeeklyReviewOutput
  let meta: CallMeta | null = null
  let source: 'llm' | 'engine' = 'llm'
  try {
    const { settings: s, profile } = settingsView
    const result = await llm.complete({
      job: 'weekly_review',
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: reviewMessage({
            metrics,
            rails: {
              calorie_floor: s.calorie_floor,
              calorie_ceiling: s.calorie_ceiling,
              protein_min_g: s.protein_min_g,
              fat_min_g: s.fat_min_g,
              fasts_per_month: s.fasts_per_month,
              fast_hours: s.fast_hours,
            },
            targets: plan.targets,
            goal: { weight_kg: profile.goal_weight_kg, date: profile.goal_date },
            next_week_planned_fasts: fastDates,
          }),
        },
      ],
      schema: WeeklyReviewOutput,
      maxTokens: MAX_TOKENS,
      priority: 'background',
    })
    output = result.data
    const { data: _data, ...rest } = result
    meta = rest
  } catch (e) {
    source = 'engine'
    console.warn(JSON.stringify({ level: 'warn', msg: 'weekly_review: router failed; writing the engine review', week_start, error: e instanceof Error ? e.message : String(e) }))
    const engine = engineReview(metrics, 'The AI narrative was unavailable this time, so this is the engine summary; nothing was proposed.')
    output = {
      narrative: engine.narrative.slice(0, MAX_NARRATIVE),
      highlights: clip(engine.highlights),
      concerns: clip(engine.concerns),
      proposals: [],
      week_plan: fallbackPlan(),
    }
  }

  // A redraft replaces the earlier AI draft: its proposals still pending are withdrawn (rejected) in the batch below.
  const withdrawn = existing ? storedProposals(existing).filter((p) => p.event_id && p.status === 'pending').map((p) => p.event_id!) : []
  const statuses = withdrawn.length ? await proposalStatuses(ai, withdrawn) : new Map()
  const withdraw = withdrawn.filter((id) => statuses.get(id) === 'pending').map((id) => proposalDecisionUpdate(ai, id, { status: 'rejected' }))

  const week = isoWeek(week_start)
  const proposed = output.proposals.length
    ? await proposalStatements(ai, { changes: output.proposals, reason: proposalReason(week, output.proposals) })
    : null
  const proposals = proposed ? reviewProposals(proposed) : []

  const now = ai.now().toISOString()
  const id = existing?.id ?? crypto.randomUUID()
  const fields = {
    metrics,
    narrative: output.narrative,
    // The shared author id for an AI-written row (as OpenRouter or any other fallback), never a provider name.
    author: 'gemini' as const,
    proposals,
    highlights: output.highlights,
    concerns: output.concerns,
    pdf_path: null,
    updated_at: now,
  }
  const trend = metrics.trend_change_kg === null ? '' : `: trend ${metrics.trend_change_kg > 0 ? '+' : ''}${metrics.trend_change_kg.toFixed(1)} kg`
  const event = eventInsert(ai, { kind: 'review', summary: `Weekly review ${week}${trend}`, body: { review_id: id, week_start }, date: addDays(week_start, 6) })
  await runBatch(ai.db, [
    ...withdraw,
    ...(proposed?.statements ?? []),
    ai.db
      .insert(weekly_reviews)
      .values({ id, week_start, ...fields, created_at: now })
      // Never overwrite a Claude review written while this draft ran.
      .onConflictDoUpdate({ target: weekly_reviews.week_start, set: fields, setWhere: sql`${weekly_reviews.author} = 'gemini'` }),
    event.statement,
  ])

  const row = await findReviewRow(ai, week_start)
  const review = row && (await readReview(ai, row))
  if (!review) throw new Error(`weekly review for ${week_start} was written but cannot be read back`)
  if (row.author === 'gemini') {
    // The current targets, water and steps carried forward: the model's proposals are pending proposals, not the plan.
    const carried = fallbackPlan()
    const drafted = { ...output.week_plan, targets: carried.targets, water_ml: carried.water_ml, steps: carried.steps }
    await storeDraftPlan(ai, { week_start: next_start, review_id: row.id, plans: [drafted, carried] })
  }
  return { status: 'written', source, review, output, meta }
}

/**
 * Next week's plan from this draft, stored as proposed with the AI author id (so the week never starts without a plan;
 * a plan by Claude or Aaron is never replaced). The first candidate that passes the guards is kept — the model's plan,
 * else the carried-forward one. A failure here never fails the review.
 */
async function storeDraftPlan(ai: Deps, input: { week_start: string; review_id: string; plans: WeekPlanContent[] }): Promise<void> {
  try {
    for (const plan of input.plans) {
      const r = await proposeWeekPlan(ai, { week_start: input.week_start, plan, author: 'gemini', review_id: input.review_id })
      if (r.week_plan || r.note) return
      console.warn(JSON.stringify({ level: 'warn', msg: 'weekly_review: week plan draft rejected', week_start: input.week_start, rejected: r.rejected }))
    }
  } catch (e) {
    console.warn(JSON.stringify({ level: 'warn', msg: 'weekly_review: week plan draft not stored', week_start: input.week_start, error: e instanceof Error ? e.message : String(e) }))
  }
}

const proposalReason = (week: string, changes: readonly PlanChange[]) =>
  `Weekly review ${week}: ${changes.map((c) => c.reason).join('; ')}`.slice(0, 480)

/**
 * The guarded outcome as the review shows it: each accepted change (in the pending proposal), followed by the later
 * steps of a split kcal move (each its own pending proposal, due a week apart), then what the guards dropped.
 */
function reviewProposals(result: ProposalStatements): ReviewProposal[] {
  const same = (a: PlanChange, b: PlanChange) => a.field === b.field && a.weekday === b.weekday
  const out: ReviewProposal[] = []
  for (const change of result.accepted) {
    const later = result.scheduled.filter((s) => same(s.change, change)).sort((a, b) => a.week_offset - b.week_offset)
    const steps = later.length + 1
    out.push({ ...change, status: 'pending', event_id: result.proposal_id, note: steps > 1 ? `Step 1 of ${steps}` : null })
    for (const s of later)
      out.push({ ...s.change, status: 'pending', event_id: s.proposal_id, note: `Step ${s.week_offset + 1} of ${steps}, due ${s.due}` })
  }
  // A kcal move with nothing to apply this week (the rolling 150 kcal week): only its scheduled steps.
  const waiting = result.scheduled.filter((s) => !result.accepted.some((c) => same(c, s.change)))
  for (const s of waiting) out.push({ ...s.change, status: 'pending', event_id: s.proposal_id, note: `Due ${s.due}` })
  for (const r of result.rejected) out.push({ ...r.change, status: 'rejected', event_id: null, note: r.reason })
  return out
}
