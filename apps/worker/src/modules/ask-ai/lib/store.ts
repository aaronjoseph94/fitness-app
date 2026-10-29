// Owns: Ask AI's rows in chat_messages — the stored shape of tool calls (the contract's ToolCall plus what each call
// created that waits for a tap), rows ↔ ChatMessage, a thread's recent turns as model history, the thread list, and a
// turn's writes (its running placeholder, then its tool rows and the placeholder filled in, in one batch). tool_calls holds: assistant → every call of the turn; tool → the one call it answers.
// forecast (assistant): how the forecast moved after the message's facts were logged (ForecastShift, parsed on read).
// running (assistant): the turn's placeholder, written with the dump's receipts before the coach pass and filled in at
// the end; one still running after RUNNING_STALE_MS was cut off (its isolate died) and reads as INTERRUPTED.
import { ForecastShift, type ChatMessage, type ChatRole, type ToolCall } from '@fitness/shared/schemas'
import { and, desc, eq, max, min, sql } from 'drizzle-orm'
import { chat_messages, chunk, runBatch, type Row } from '../../../db'
import type { Deps } from '../../../lib/deps'
import type { Msg } from '../../llm'

export type ChatRow = Row<typeof chat_messages>

/** Something a call created that waits for a tap (resolved to a ChatProposal with its status on read). */
export type ProposalRef =
  { type: 'proposal'; id: string } | { type: 'week_plan'; id: string; week_start: string }

export type StoredCall = ToolCall & { created?: ProposalRef[] }

/** The calm replies a turn falls back to; never replayed to the model as history. */
export const FALLBACK = {
  ai_unavailable:
    "I can't reach the AI right now: the free models are busy or out of quota for the moment. Nothing is lost; try again in a minute. Logging still works from the Log tab.",
  too_many_steps:
    'That needed more steps than I can take in one go. What I looked up is listed below; try asking one thing at a time.',
} as const
/**
 * The ai_unavailable reply when no provider has a key at all, in the shared no-model-key wording: waiting cannot help,
 * so it doesn't say "try again".
 */
export const NOT_SET_UP =
  "Ask AI isn't set up yet: add a model key in Settings → AI to use this. Nothing is lost; logging, the plan and every chart still work."
/** The not-set-up reply as stored before 2026-10-23 (it blamed the server), still in older threads. */
export const NOT_SET_UP_BEFORE =
  "Ask AI isn't set up yet: no AI provider key is configured on the server, so I can't answer. Nothing is lost; logging, the plan and every chart still work."
const FALLBACK_TEXTS = new Set<string>([...Object.values(FALLBACK), NOT_SET_UP, NOT_SET_UP_BEFORE])

/** A turn is at most 55 s; a placeholder older than this was cut off. */
export const RUNNING_STALE_MS = 120_000
/** A running turn as read back while it still runs (anything it logged is already listed with the reply). */
export const RUNNING = 'Still working on this; the answer follows in a moment.'
/** A running turn that was cut off: what it logged stands, the answer never came. */
export const INTERRUPTED = 'I logged these; the answer was cut off — ask again.'

/** Whether a running placeholder was cut off (older than RUNNING_STALE_MS at `now`). */
export const isStale = (row: Pick<ChatRow, 'updated_at'>, now: Date) =>
  now.getTime() - Date.parse(row.updated_at) > RUNNING_STALE_MS

/**
 * A row as shown: a running placeholder keeps its empty content (the web reads an assistant row with content as the
 * answer, so it keeps polling) unless `running` gives a text (a replay's reply), and reads INTERRUPTED once stale.
 */
export function asShown(row: ChatRow, now: Date, running = ''): ChatRow {
  if (!row.running) return row
  return { ...row, content: isStale(row, now) ? INTERRUPTED : running }
}

/** Model turns kept as history (user questions and assistant answers only; tool rounds are not replayed). */
const HISTORY_ROWS = 12
const THREAD_ROWS = 300
const THREAD_LIST = 30
/** chat_messages has 9 columns; D1 allows 100 bound parameters per statement. */
const ROWS_PER_INSERT = Math.floor(100 / 9)

export function storedCalls(row: Pick<ChatRow, 'tool_calls'>): StoredCall[] {
  return Array.isArray(row.tool_calls) ? (row.tool_calls as StoredCall[]) : []
}

export function toChatMessage(
  row: ChatRow,
  proposals: ChatMessage['proposals'] = [],
  receipts: ChatMessage['receipts'] = [],
): ChatMessage {
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
    receipts,
    forecast: row.forecast == null ? null : (ForecastShift.safeParse(row.forecast).data ?? null),
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

/**
 * The recent questions and answers of a thread as model history, oldest first, the last question asked, and the id of
 * the assistant row that answered it (null: none yet), so the caller can see whether that question logged anything.
 * A running placeholder is no answer yet and is left out.
 */
export async function history(
  deps: Deps,
  thread_id: string,
): Promise<{ messages: Msg[]; lastQuestion: string | null; lastAnswerId: string | null }> {
  const rows = await deps.db
    .select({
      id: chat_messages.id,
      role: chat_messages.role,
      content: chat_messages.content,
      running: chat_messages.running,
    })
    .from(chat_messages)
    .where(and(eq(chat_messages.thread_id, thread_id), sql`${chat_messages.role} != 'tool'`))
    .orderBy(desc(chat_messages.created_at))
    .limit(HISTORY_ROWS)
  const ordered = rows.reverse()
  const lastUser = ordered.findLastIndex((r) => r.role === 'user')
  const lastAnswerId =
    lastUser === -1 ? null : (ordered.slice(lastUser + 1).find((r) => r.role === 'assistant')?.id ?? null)
  const turns = ordered.filter(
    (r) => !(r.role === 'assistant' && (r.running || FALLBACK_TEXTS.has(r.content))),
  )
  // A model conversation starts with a question.
  while (turns[0] && turns[0].role !== 'user') turns.shift()
  // Adjacent turns of one role (a question whose answer failed) merge, so the roles alternate as providers expect.
  const messages: Msg[] = []
  for (const r of turns) {
    const last = messages.at(-1)
    if (last && last.role === r.role) last.content = `${last.content}\n\n${r.content}`
    else
      messages.push(
        r.role === 'user' ? { role: 'user', content: r.content } : { role: 'assistant', content: r.content },
      )
  }
  const lastQuestion = lastUser === -1 ? null : ordered[lastUser]!.content
  return { messages, lastQuestion, lastAnswerId }
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
    .innerJoin(
      threads,
      and(eq(chat_messages.thread_id, threads.thread_id), eq(chat_messages.created_at, threads.first_at)),
    )
    .orderBy(desc(threads.last_at))
  const seen = new Set<string>()
  return rows.map((r) => r.row).filter((r) => !seen.has(r.thread_id) && !!seen.add(r.thread_id))
}

/**
 * The statement writing a turn's placeholder reply (running, no content yet), for the batch that also stores the
 * dump's receipts: from then on a replay of the message sees the turn and what it logged.
 */
export function placeholderInsert(deps: Deps, placeholder: ChatRow) {
  return deps.db.insert(chat_messages).values({ ...placeholder, content: '', running: true })
}

/**
 * Finish a turn in one db.batch: its tool rows (chunked inserts, already ordered by created_at) and the placeholder
 * filled in — content, calls, forecast, created_at after the tool rows — and no longer running.
 */
export async function finishTurn(deps: Deps, tools: readonly ChatRow[], assistant: ChatRow): Promise<void> {
  await runBatch(deps.db, [
    ...chunk(tools, ROWS_PER_INSERT).map((part) =>
      deps.db.insert(chat_messages).values(part).onConflictDoNothing(),
    ),
    deps.db
      .update(chat_messages)
      .set({
        content: assistant.content,
        tool_calls: assistant.tool_calls,
        forecast: assistant.forecast,
        running: false,
        created_at: assistant.created_at,
        updated_at: assistant.updated_at,
      })
      .where(eq(chat_messages.id, assistant.id)),
  ])
}
