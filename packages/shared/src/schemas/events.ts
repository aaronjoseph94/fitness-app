// Owns: AI events (`ai_events`: adjustment, proposal, review, note, change) as the dashboard and MCP read them,
// the GET /api/events?since= poll, and the accept/reject result of a proposal.
import * as z from 'zod'
import { Actor, Id, Instant, LocalDate, Row } from './common'
import { DayAdjustmentOutput } from './jobs'
import { PlanVersion, ProposalBody, ProposalStatus } from './plan'

export const EventKind = z.enum(['adjustment', 'proposal', 'review', 'note', 'change'])
export type EventKind = z.infer<typeof EventKind>

const EventFields = Row.extend({
  actor: Actor,
  summary: z.string(),
  plan_version_id: Id.nullable(),
  read_at: Instant.nullable(),
})

/** One field that changed: a dotted path and its JSON values before and after. */
export const FieldChange = z.object({ path: z.string().min(1), from: z.json(), to: z.json() })
export type FieldChange = z.infer<typeof FieldChange>

/** A pending or resolved proposal (ai_events kind "proposal"). */
export const Proposal = EventFields.extend({
  kind: z.literal('proposal'),
  body: ProposalBody,
  proposal_status: ProposalStatus,
})
export type Proposal = z.infer<typeof Proposal>

export const AiEvent = z.discriminatedUnion('kind', [
  EventFields.extend({ kind: z.literal('adjustment'), body: DayAdjustmentOutput.extend({ date: LocalDate }) }),
  Proposal,
  EventFields.extend({ kind: z.literal('review'), body: z.object({ review_id: Id, week_start: LocalDate }) }),
  EventFields.extend({ kind: z.literal('note'), body: z.object({ text: z.string().min(1) }) }),
  /** A change applied without a proposal: settings edits by Aaron, MCP writes. */
  EventFields.extend({ kind: z.literal('change'), body: z.object({ entity: z.string().min(1), changes: z.array(FieldChange) }) }),
])
export type AiEvent = z.infer<typeof AiEvent>

/** Query of GET /api/events: events created or updated after `since` (omit for the latest page). */
export const EventsQuery = z.object({ since: Instant.optional() })
export type EventsQuery = z.infer<typeof EventsQuery>

/** Response of GET /api/events. Pass `server_time` back as the next `since`, so the client clock never matters. */
export const EventsResponse = z.object({ events: z.array(AiEvent), server_time: Instant })
export type EventsResponse = z.infer<typeof EventsResponse>

/** Response of POST /api/proposals/:id/accept|reject: the resolved proposal and the plan version accepting created. */
export const ProposalDecision = z.object({ proposal: Proposal, plan_version: PlanVersion.nullable() })
export type ProposalDecision = z.infer<typeof ProposalDecision>
