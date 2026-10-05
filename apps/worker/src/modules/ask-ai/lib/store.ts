// Owns: Ask AI's rows in chat_messages — the stored shape of tool calls (the contract's ToolCall plus what each call
// created that waits for a tap), rows ↔ ChatMessage, a thread's recent turns as model history, the thread list, and the
// chunked insert of one turn. tool_calls holds: assistant → every call of the turn; tool → the one call it answers.
import type { ChatMessage, ChatRole, ToolCall } from '@fitness/shared/schemas'
import { and, desc, eq, max, min, sql } from 'drizzle-orm'
import { chat_messages, type Row } from '../../../db'
import type { Deps } from '../../../lib/deps'
import type { Msg } from '../../llm'

export type ChatRow = Row<typeof chat_messages>

/** Something a call created that waits for a tap (resolved to a ChatProposal with its status on read). */
export type ProposalRef = { type: 'proposal'; id: string } | { type: 'week_plan'; id: string; week_start: string }

export type StoredCall = ToolCall & { created?: ProposalRef[] }

/** The calm replies a turn falls back to; never replayed to the model as history. */
export const FALLBACK = {
  ai_unavailable:
    "I can't reach the AI right now: the free models are busy or out of quota for the moment. Nothing is lost; try again in a minute. Logging still works from the Log tab.",
  too_many_steps:
    'That needed more steps than I can take in one go. What I looked up is listed below; try asking one thing at a time.',
} as const
const FALLBACK_TEXTS = new Set<string>(Object.values(FALLBACK))

/** Model turns kept as history (user questions and assistant answers only; tool rounds are not replayed). */
const HISTORY_ROWS = 12
const THREAD_ROWS = 300
const THREAD_LIST = 30
/** chat_messages has 7 columns; D1 allows 100 bound parameters per statement. */
const ROWS_PER_INSERT = Math.floor(100 / 7)

export function storedCalls(row: Pick<ChatRow, 'tool_calls'>): StoredCall[] {
  return Array.isArray(row.tool_calls) ? (row.tool_calls as StoredCall[]) : []
}

export function toChatMessage(row: ChatRow, proposals: ChatMessage['proposals'] = []): ChatMessage {
  const calls = Array.isArray(row.tool_calls)
    ? storedCalls(row).map(({ id, name, args, ok }) => ({ id, name, args, ok }))
    : null
  return {
    id: row.id,
    thread_id: row.thread_id,
    role: row.role as ChatRole,
    content: row.content,
    tool_calls: calls,
    proposals,
    created_at: row.created_at,
  }
}

export async function messageById(deps: Deps, id: string): Promise<ChatRow | null> {
  const [row] = await deps.db.select().from(chat_messages).where(eq(chat_messages.id, id))
  return row ?? null
}

/** A thread's rows oldest first (the newest THREAD_ROWS). */
export async function threadRows(deps: Deps, thread_id: string): Promise<ChatRow[]> {
  const rows = await deps.db
    .select()
    .from(chat_messages)
    .where(eq(chat_messages.thread_id, thread_id))
    .orderBy(desc(chat_messages.created_at))
    .limit(THREAD_ROWS)
  return rows.reverse()
}

/** The recent questions and answers of a thread as model history, oldest first, and the last question asked. */
export async function history(deps: Deps, thread_id: string): Promise<{ messages: Msg[]; lastQuestion: string | null }> {
  const rows = await deps.db
    .select({ role: chat_messages.role, content: chat_messages.content })
    .from(chat_messages)
    .where(and(eq(chat_messages.thread_id, thread_id), sql`${chat_messages.role} != 'tool'`))
    .orderBy(desc(chat_messages.created_at))
    .limit(HISTORY_ROWS)
  const turns = rows.reverse().filter((r) => !(r.role === 'assistant' && FALLBACK_TEXTS.has(r.content)))
  // A model conversation starts with a question.
  while (turns[0] && turns[0].role !== 'user') turns.shift()
  // Adjacent turns of one role (a question whose answer failed) merge, so the roles alternate as providers expect.
  const messages: Msg[] = []
  for (const r of turns) {
    const last = messages.at(-1)
    if (last && last.role === r.role) last.content = `${last.content}\n\n${r.content}`
    else messages.push(r.role === 'user' ? { role: 'user', content: r.content } : { role: 'assistant', content: r.content })
  }
  const lastQuestion = [...turns].reverse().find((r) => r.role === 'user')?.content ?? null
  return { messages, lastQuestion }
}

/** Each thread's opening question, most recently active thread first. */
export async function threadOpenings(deps: Deps): Promise<ChatRow[]> {
  const threads = deps.db
    .select({
      thread_id: chat_messages.thread_id,
      first_at: min(chat_messages.created_at).as('first_at'),
      last_at: max(chat_messages.created_at).as('last_at'),
    })
    .from(chat_messages)
    .groupBy(chat_messages.thread_id)
    .orderBy(desc(max(chat_messages.created_at)))
    .limit(THREAD_LIST)
    .as('threads')
  const rows = await deps.db
    .select({ row: chat_messages })
    .from(chat_messages)
    .innerJoin(threads, and(eq(chat_messages.thread_id, threads.thread_id), eq(chat_messages.created_at, threads.first_at)))
    .orderBy(desc(threads.last_at))
  const seen = new Set<string>()
  return rows.map((r) => r.row).filter((r) => !seen.has(r.thread_id) && !!seen.add(r.thread_id))
}

/** Insert one turn's rows (already ordered by created_at) as chunked statements in one db.batch. */
export async function insertTurn(deps: Deps, rows: readonly ChatRow[]): Promise<void> {
  const statements = []
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT)
    statements.push(deps.db.insert(chat_messages).values(rows.slice(i, i + ROWS_PER_INSERT)).onConflictDoNothing())
  const [first, ...rest] = statements
  if (first) await deps.db.batch([first, ...rest])
}
