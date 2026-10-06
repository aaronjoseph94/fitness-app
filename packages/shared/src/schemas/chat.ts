// Owns: Ask AI chat — messages, the tool calls they show, what a turn created that waits for a tap, the send body and
// its in-request reply, the history query (one thread, or the list of threads) and the delete query.
import * as z from 'zod'
import { Id, Instant, LocalDate } from './common'
import { ProposalBody, ProposalStatus } from './plan'
import { WeekPlanStatus } from './week-plan'

export const ChatRole = z.enum(['user', 'assistant', 'tool'])
export type ChatRole = z.infer<typeof ChatRole>

/** One tools-layer call the assistant made (the panel shows which tools were called). */
export const ToolCall = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  args: z.record(z.string(), z.json()),
  ok: z.boolean().nullable(),
})
export type ToolCall = z.infer<typeof ToolCall>

/**
 * Something an Ask AI turn created that waits for Aaron's tap, with its status now. A `proposal` is an ai_events
 * proposal: accept/reject with POST /api/proposals/:id/accept|reject (a workout is accepted by saving it as a template
 * with its proposal_id; a week_plan body by applying that week plan). A `week_plan` is a proposed week plan: accept with
 * POST /api/week-plans/:id/apply.
 */
export const ChatProposal = z.discriminatedUnion('type', [
  z.object({ type: z.literal('proposal'), id: Id, summary: z.string(), status: ProposalStatus, body: ProposalBody }),
  z.object({ type: z.literal('week_plan'), id: Id, week_start: LocalDate, status: WeekPlanStatus, focus_note: z.string() }),
])
export type ChatProposal = z.infer<typeof ChatProposal>

export const ChatMessage = z.object({
  id: Id,
  thread_id: Id,
  role: ChatRole,
  /** user: the question; assistant: the reply; tool: the tool's result as JSON text (what the model read). */
  content: z.string(),
  /** assistant: every call made in that turn; tool: the one call this row answers. */
  tool_calls: z.array(ToolCall).nullable(),
  /** assistant: what the turn created that waits for a tap, with its status now. */
  proposals: z.array(ChatProposal).default([]),
  created_at: Instant,
})
export type ChatMessage = z.infer<typeof ChatMessage>

/** Body of POST /api/ai/chat: Aaron's message (client id; replaying it returns the stored turn) on a thread (client id for a new thread). */
export const ChatSend = z.object({ id: Id, thread_id: Id, content: z.string().trim().min(1).max(4000) })
export type ChatSend = z.infer<typeof ChatSend>

/** Why a turn ended without a real answer: no model reachable, or more tool rounds than a turn allows. */
export const ChatTurnError = z.enum(['ai_unavailable', 'too_many_steps'])
export type ChatTurnError = z.infer<typeof ChatTurnError>

/** Response of POST /api/ai/chat (answered in the request): the stored message, the tool results, the reply. */
export const ChatSent = z.object({
  message: ChatMessage,
  /** One tool row per call, in call order (content = the JSON the model read). */
  tool_messages: z.array(ChatMessage),
  /** The assistant reply: tool_calls = the calls made this turn, proposals = what waits for a tap. */
  reply: ChatMessage,
  /** Set when the reply is the calm fallback rather than an answer. */
  error: ChatTurnError.nullable(),
})
export type ChatSent = z.infer<typeof ChatSent>

/** Query of GET /api/ai/chat: a thread's messages oldest first; without thread_id, each thread's opening message, most recently active thread first. */
export const ChatHistoryQuery = z.object({ thread_id: Id.optional() })
export type ChatHistoryQuery = z.infer<typeof ChatHistoryQuery>

/** Query of DELETE /api/ai/chat: the thread to forget, its messages and tool rows deleted for good. */
export const ChatThreadQuery = z.object({ thread_id: Id })
export type ChatThreadQuery = z.infer<typeof ChatThreadQuery>
