// Owns: Ask AI chat — messages, the tool calls they show, the send body and the history query.
import * as z from 'zod'
import { Id, Instant } from './common'

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

export const ChatMessage = z.object({
  id: Id,
  thread_id: Id,
  role: ChatRole,
  content: z.string(),
  tool_calls: z.array(ToolCall).nullable(),
  created_at: Instant,
})
export type ChatMessage = z.infer<typeof ChatMessage>

/** Body of POST /api/ai/chat: Aaron's message (client id) on a thread (client id for a new thread). */
export const ChatSend = z.object({ id: Id, thread_id: Id, content: z.string().trim().min(1).max(4000) })
export type ChatSend = z.infer<typeof ChatSend>

/** Response of POST /api/ai/chat: the stored message and the ask_ai job producing the reply. */
export const ChatSent = z.object({ message: ChatMessage, job_id: Id })
export type ChatSent = z.infer<typeof ChatSent>

/** Query of GET /api/ai/chat. */
export const ChatHistoryQuery = z.object({ thread_id: Id })
export type ChatHistoryQuery = z.infer<typeof ChatHistoryQuery>
