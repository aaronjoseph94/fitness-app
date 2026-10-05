// Owns: AI events (`ai_events`: adjustment, proposal, review, note, change) — the since-poll the dashboard and MCP read,
// pending proposals, and the one way any module writes an event (eventInsert inside its own db.batch, or recordEvent).
// Interface:
//   eventInsert(deps, input)            → { id, statement }   (put the statement in the caller's db.batch)
//   recordEvent(deps, input)            → id                  (standalone write)
//   listEvents(deps, { since? })        → EventsResponse      (created or updated at/after `since`, 200 a page, the next
//                                                              `since` overlapping 5 s; else the latest 50 plus every
//                                                              pending proposal due by today)
//   pendingProposals(deps, date)        → { pending_count, latest }  (proposals due on or before `date`)
//   getProposalRow(deps, id) / toProposal(row) / toEvent(row)    (row ↔ contract mapping; bodies parsed with Zod)
//   proposalDecisionUpdate(deps, id, …)  → statement resolving a pending proposal (accepted/rejected/auto_applied)
//   seriesRejectUpdate(deps, series_id, after) → statement rejecting a kcal series' pending steps (due after `after`)
//   releaseDueProposals(deps, date)     → touches proposals scheduled for `date` so the since-poll delivers them
// A proposal with a future `date` is a scheduled one (a later ≤150 kcal step); it stays hidden until that date.
import { today } from '@fitness/shared/engine'
import { AiEvent, Proposal, type EventKind, type EventsResponse, type ProposalStatus } from '@fitness/shared/schemas'
import { and, asc, count, desc, eq, gt, gte, isNull, lte, or, sql } from 'drizzle-orm'
import { ai_events, type Row } from '../../db'
import type { Deps } from '../../lib/deps'

export type EventRow = Row<typeof ai_events>

export interface EventInput {
  kind: EventKind
  summary: string
  /** Stored as JSON; must satisfy the AiEvent body for `kind` (extra keys are kept in storage, stripped on read). */
  body: unknown
  /** The local date the event belongs to; for a proposal, the date it becomes due (null = now). */
  date?: string | null
  proposal_status?: ProposalStatus | null
  plan_version_id?: string | null
  job_id?: string | null
  id?: string
}

const LATEST_PAGE = 50
/** Pending proposals the latest page always carries (more than a few is already a backlog). */
const PENDING_PAGE = 50
const SINCE_PAGE = 200

/** An insert for one event, to run inside the caller's db.batch (actor and timestamps from deps). */
export function eventInsert(deps: Deps, input: EventInput) {
  const id = input.id ?? crypto.randomUUID()
  const now = deps.now().toISOString()
  const statement = deps.db.insert(ai_events).values({
    id,
    kind: input.kind,
    actor: deps.actor,
    date: input.date ?? null,
    summary: input.summary,
    body: input.body,
    proposal_status: input.proposal_status ?? null,
    plan_version_id: input.plan_version_id ?? null,
    job_id: input.job_id ?? null,
    created_at: now,
    updated_at: now,
  })
  return { id, statement }
}

/** Write one event on its own. */
export async function recordEvent(deps: Deps, input: EventInput): Promise<string> {
  const { id, statement } = eventInsert(deps, input)
  await statement
  return id
}

/** Row → contract event, or null when the stored body no longer matches its schema (skipped, logged). */
export function toEvent(row: EventRow): AiEvent | null {
  const parsed = AiEvent.safeParse({
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    kind: row.kind,
    actor: row.actor,
    summary: row.summary,
    body: row.body,
    proposal_status: row.proposal_status ?? undefined,
    plan_version_id: row.plan_version_id,
    read_at: row.read_at,
  })
  if (!parsed.success) {
    console.warn(`ai_events ${row.id} (${row.kind}) does not match its schema; skipped`)
    return null
  }
  return parsed.data
}

/** Row → Proposal, or null when the row is not a well-formed proposal. */
export function toProposal(row: EventRow): Proposal | null {
  if (row.kind !== 'proposal') return null
  const event = toEvent(row)
  return event?.kind === 'proposal' ? event : null
}

export async function getProposalRow(deps: Deps, id: string): Promise<EventRow | null> {
  const [row] = await deps.db
    .select()
    .from(ai_events)
    .where(and(eq(ai_events.id, id), eq(ai_events.kind, 'proposal')))
  return row ?? null
}

/** The since-poll re-reads this much before its own time: an event stamped just before a poll but written after it. */
const POLL_OVERLAP_MS = 5_000

/**
 * GET /api/events?since=: events created or updated at or after `since`, oldest change first (a client dedupes by
 * id), or the latest 50 (plus the pending proposals due by today, however old) when `since` is absent. Scheduled proposals not yet due are left out. `server_time` is the next
 * `since`:
 *   a full page (200)  → the last row's updated_at, so the rest arrive on the next poll (+1 ms when the whole page
 *                         shares one instant, so the poll always moves on)
 *   otherwise          → now − 5 s (an event stamped before this poll but committed after it still arrives)
 */
export async function listEvents(deps: Deps, input: { since?: string }): Promise<EventsResponse> {
  const now = deps.now()
  let server_time = new Date(now.getTime() - POLL_OVERLAP_MS).toISOString()
  let rows: EventRow[]
  if (input.since) {
    // updated_at ≥ created_at on every row, so "created or updated since" is updated_at ≥ since.
    rows = await deps.db
      .select()
      .from(ai_events)
      .where(or(gte(ai_events.created_at, input.since), gte(ai_events.updated_at, input.since)))
      .orderBy(asc(ai_events.updated_at), asc(ai_events.id))
      .limit(SINCE_PAGE)
    const first = rows[0]
    const last = rows.at(-1)
    if (rows.length === SINCE_PAGE && first && last)
      server_time = first.updated_at === last.updated_at ? new Date(Date.parse(last.updated_at) + 1).toISOString() : last.updated_at
  } else {
    // The latest 50, plus every pending proposal due by today however old (a kcal step proposed a week ago): the AI tab
    // and the plan page list what waits for a tap from this page.
    const [latest, waiting] = await deps.db.batch([
      deps.db.select().from(ai_events).orderBy(desc(ai_events.created_at)).limit(LATEST_PAGE),
      deps.db
        .select()
        .from(ai_events)
        .where(and(eq(ai_events.kind, 'proposal'), eq(ai_events.proposal_status, 'pending'), or(isNull(ai_events.date), lte(ai_events.date, today(now)))))
        .orderBy(desc(ai_events.created_at))
        .limit(PENDING_PAGE),
    ])
    const ids = new Set(latest.map((r) => r.id))
    rows = [...latest, ...waiting.filter((r) => !ids.has(r.id))].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  }
  const due = today(now)
  const events = rows
    .filter((r) => !(r.kind === 'proposal' && r.date !== null && r.date > due))
    .map(toEvent)
    .filter((e): e is AiEvent => e !== null)
  return { events, server_time }
}

/** Pending proposals due on or before `date`: how many, and the newest one. */
export async function pendingProposals(deps: Deps, date: string): Promise<{ pending_count: number; latest: Proposal | null }> {
  const due = and(
    eq(ai_events.kind, 'proposal'),
    eq(ai_events.proposal_status, 'pending'),
    or(isNull(ai_events.date), lte(ai_events.date, date)),
  )
  const [counted, latestRows] = await deps.db.batch([
    deps.db.select({ n: count() }).from(ai_events).where(due),
    deps.db.select().from(ai_events).where(due).orderBy(desc(ai_events.created_at)).limit(3),
  ])
  const latest = latestRows.map(toProposal).find((p) => p !== null) ?? null
  return { pending_count: counted[0]?.n ?? 0, latest }
}

/**
 * Resolve a pending proposal (a no-op when it is no longer pending), for the caller's db.batch. `plan_version_id` links
 * the version accepting it created.
 */
export function proposalDecisionUpdate(
  deps: Deps,
  id: string,
  decision: { status: Exclude<ProposalStatus, 'pending'>; plan_version_id?: string | null },
) {
  const now = deps.now().toISOString()
  return deps.db
    .update(ai_events)
    .set({ proposal_status: decision.status, plan_version_id: decision.plan_version_id ?? null, read_at: now, updated_at: now })
    .where(and(eq(ai_events.id, id), eq(ai_events.kind, 'proposal'), eq(ai_events.proposal_status, 'pending')))
}

/**
 * Reject the pending later steps of a kcal move split into steps (proposal body `series_id`), for the caller's
 * db.batch: every pending step of the series, or with `after` (the rejected step's own due date) only those due later.
 */
export function seriesRejectUpdate(deps: Deps, series_id: string, after: string | null = null) {
  const now = deps.now().toISOString()
  return deps.db
    .update(ai_events)
    .set({ proposal_status: 'rejected', read_at: now, updated_at: now })
    .where(
      and(
        eq(ai_events.kind, 'proposal'),
        eq(ai_events.proposal_status, 'pending'),
        sql`json_extract(${ai_events.body}, '$.series_id') = ${series_id}`,
        after ? gt(ai_events.date, after) : undefined,
      ),
    )
}

/** Touch pending proposals that become due on `date` so clients polling with `since` receive them (nightly). */
export async function releaseDueProposals(deps: Deps, date: string): Promise<number> {
  const released = await deps.db
    .update(ai_events)
    .set({ updated_at: deps.now().toISOString() })
    .where(and(eq(ai_events.kind, 'proposal'), eq(ai_events.proposal_status, 'pending'), eq(ai_events.date, date)))
    .returning({ id: ai_events.id })
  return released.length
}
