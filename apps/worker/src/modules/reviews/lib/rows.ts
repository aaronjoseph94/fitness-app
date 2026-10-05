// Owns: weekly_reviews rows ↔ the WeeklyReview contract — LLM/MCP-fed JSON parsed with Zod on read, each proposal's
// status refreshed from its ai_events row (it moves when Aaron accepts or rejects), and the PDF link signed on read.
// Plus the ISO-week ↔ Monday conversion every entry point starts with.
import { isoWeek, isoWeekRange } from '@fitness/shared/engine'
import { ReviewProposal, WeeklyMetrics, type ProposalStatus, type WeeklyReview } from '@fitness/shared/schemas'
import { inArray } from 'drizzle-orm'
import * as z from 'zod'
import { ai_events, weekly_reviews, type Row } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { badRequest } from '../../../lib/http-error'
import { signFileUrl } from '../../files'

export type ReviewRow = Row<typeof weekly_reviews>

const StoredProposals = z.array(ReviewProposal)
const StoredStrings = z.array(z.string())
/** Bound parameters per statement (D1 allows 100). */
const IN_CHUNK = 90

/** "2026-W40" → its Monday "2026-09-28"; 400 for a week the year does not have. */
export function weekStartOf(week: string): string {
  try {
    return isoWeekRange(week).from
  } catch {
    throw badRequest(`${week} is not an ISO week`)
  }
}

/** Current proposal_status of each event id (missing ids are left out). */
export async function proposalStatuses(deps: Deps, ids: readonly string[]): Promise<Map<string, ProposalStatus>> {
  const out = new Map<string, ProposalStatus>()
  const unique = [...new Set(ids)]
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const rows = await deps.db
      .select({ id: ai_events.id, status: ai_events.proposal_status })
      .from(ai_events)
      .where(inArray(ai_events.id, unique.slice(i, i + IN_CHUNK)))
    for (const r of rows) if (r.status) out.set(r.id, r.status)
  }
  return out
}

/** The stored proposals of a row (empty when the JSON no longer parses). */
export function storedProposals(row: Pick<ReviewRow, 'id' | 'proposals'>): ReviewProposal[] {
  const parsed = StoredProposals.safeParse(row.proposals ?? [])
  if (!parsed.success) console.warn(`weekly_reviews ${row.id}: stored proposals do not match their schema; shown as none`)
  return parsed.success ? parsed.data : []
}

/** Row → contract, or null when its metrics no longer match the schema (skipped and logged). */
export async function toReview(deps: Deps, row: ReviewRow, statuses: Map<string, ProposalStatus>): Promise<WeeklyReview | null> {
  const metrics = WeeklyMetrics.safeParse(row.metrics)
  if (!metrics.success) {
    console.warn(`weekly_reviews ${row.id} (${row.week_start}): metrics do not match the schema; skipped`)
    return null
  }
  const strings = (v: unknown) => {
    const p = StoredStrings.safeParse(v ?? [])
    return p.success ? p.data : []
  }
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    week: isoWeek(row.week_start),
    week_start: row.week_start,
    author: row.author,
    metrics: metrics.data,
    narrative: row.narrative ?? '',
    highlights: strings(row.highlights),
    concerns: strings(row.concerns),
    proposals: storedProposals(row).map((p) => ({ ...p, status: (p.event_id && statuses.get(p.event_id)) || p.status })),
    pdf_url: row.pdf_path ? await signedUrl(deps, row.pdf_path) : null,
  }
}

/** Row → contract with each proposal's live status (one ai_events read). */
export async function readReview(deps: Deps, row: ReviewRow): Promise<WeeklyReview | null> {
  const ids = storedProposals(row).flatMap((p) => (p.event_id ? [p.event_id] : []))
  return toReview(deps, row, ids.length ? await proposalStatuses(deps, ids) : new Map())
}

async function signedUrl(deps: Deps, key: string): Promise<string | null> {
  try {
    return (await signFileUrl(deps.env, key, undefined, deps.now())).url
  } catch (e) {
    console.warn(`could not sign ${key}: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}
