// Owns: one Ask AI turn, answered inside the request — claim the message id (a replayed id returns the stored turn),
// offer the model the tools picked by intent, run its tool calls through the tools layer as actor 'ai' for at most
// MAX_ROUNDS model calls, store the user / tool / assistant rows, and return the reply with the calls it made and the
// proposals it created (status now). A router failure becomes a calm stored reply, never an HTTP error.
// Prompt injection (OWASP LLM01): a tool result reaches the model as {"data": …} (data, never instructions), and a
// logging call (which applies at once) runs only when the user's own message asks to log in that area; otherwise the
// model gets needs_confirmation and must ask. Text from a food database or a note can't trigger a write by itself.
import type { ChatSend, ChatSent, ChatTurnError } from '@fitness/shared/schemas'
import { chat_messages } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { HttpError } from '../../../lib/http-error'
import type { LlmRouter, ToolCall as ModelCall, Msg, ToolDef } from '../../llm'
import { getSettings } from '../../settings'
import { callTool, toolJsonSchemas, type ToolDefinition } from '../../tools'
import { redact, systemPrompt } from './prompt'
import { withProposals } from './history'
import { createdBy } from './proposals'
import { asksToLog, selectTools, type OfferedTool } from './select'
import {
  FALLBACK,
  history,
  insertTurn,
  messageById,
  threadRows,
  toChatMessage,
  type ChatRow,
  type ProposalRef,
  type StoredCall,
} from './store'

/** Model calls per turn (each may ask for several tools). */
export const MAX_ROUNDS = 5
/** Wall time for the whole turn; each model call gets what is left, up to the router's 25 s. */
const TURN_BUDGET_MS = 55_000
const CALL_DEADLINE_MS = 25_000
const MIN_CALL_MS = 3_000
const MAX_REPLY_TOKENS = 1_024
/** A tool result longer than this reaches the model (and the stored row) cut, with a note to ask more narrowly. */
const MAX_TOOL_CHARS = 12_000

/**
 * Tool definitions as the model reads them (the descriptions name the user for the coach; redacted here), per isolate.
 * Parameters are the tools layer's JSON Schemas, warmed at isolate start-up, so no conversion runs in the request.
 */
const toolDefs = new Map<string, ToolDef>()
function toolDef(tool: ToolDefinition): ToolDef {
  let def = toolDefs.get(tool.name)
  if (!def) {
    def = { name: tool.name, description: redact(tool.description), parameters: toolJsonSchemas(tool).input }
    toolDefs.set(tool.name, def)
  }
  return def
}

interface ToolRun {
  call: StoredCall
  /** The result as stored and shown in the app (JSON). */
  content: string
  /** What the model reads: a result wrapped as {"data": …}; a refusal or error ({error, message}) as is. */
  forModel: string
  at: Date
}

/** What the turn knows about the user's own words, to decide whether a logging call may apply. */
interface Asked {
  message: string
  previousQuestion: string | null
}

export async function chatTurn(deps: Deps, llm: LlmRouter, input: ChatSend): Promise<ChatSent> {
  const started = deps.now()
  const userRow = row(input.id, input.thread_id, 'user', input.content, null, started)
  const [{ settings }, past] = await Promise.all([getSettings(deps), history(deps, input.thread_id)])
  // Claim the id first: a retried send (double tap, flaky network) replays instead of logging twice.
  const claimed = await deps.db.insert(chat_messages).values(userRow).onConflictDoNothing().returning({ id: chat_messages.id })
  if (claimed.length === 0) return replayTurn(deps, input.id)

  const offered = selectTools([input.content, ...(past.lastQuestion ? [past.lastQuestion] : [])], settings.auto_apply_safe)
  const tools = offered.map(({ tool }) => toolDef(tool))
  const allowed = new Map(offered.map((o) => [o.tool.name, o]))
  const asked: Asked = { message: input.content, previousQuestion: past.lastQuestion }
  const system = systemPrompt(started, settings)
  const messages: Msg[] = [
    ...past.messages.map((m) => ({ ...m, content: redact(m.content) })),
    { role: 'user', content: redact(input.content) },
  ]
  const ai: Deps = { ...deps, actor: 'ai' }
  const runs: ToolRun[] = []
  let reply: string | null = null
  let error: ChatTurnError | null = null

  for (let round = 0; round < MAX_ROUNDS && reply === null && error === null; round++) {
    const left = TURN_BUDGET_MS - (deps.now().getTime() - started.getTime())
    if (left < MIN_CALL_MS) {
      error = 'too_many_steps'
      break
    }
    try {
      const result = await llm.chat({
        job: 'ask_ai',
        system,
        messages,
        tools,
        priority: 'user',
        maxTokens: MAX_REPLY_TOKENS,
        deadlineMs: Math.min(CALL_DEADLINE_MS, left),
      })
      if (result.type === 'reply') {
        reply = result.data.trim()
        break
      }
      messages.push(result.message)
      for (const call of result.toolCalls) {
        const run = await runCall(ai, call, allowed, asked, runs)
        runs.push(run)
        messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: run.forModel })
      }
    } catch (e) {
      console.warn(JSON.stringify({ at: 'ask_ai', event: 'llm_failed', error: e instanceof Error ? e.name : 'unknown' }))
      error = 'ai_unavailable'
    }
  }
  if (reply === null && error === null) error = 'too_many_steps'

  const calls = runs.map((r) => r.call)
  let last = started.getTime()
  const stamp = (at: Date) => {
    last = Math.max(last + 1, at.getTime())
    return new Date(last)
  }
  const toolRows = runs.map((r) =>
    row(crypto.randomUUID(), input.thread_id, 'tool', r.content, [r.call], stamp(r.at)),
  )
  const assistant = row(
    crypto.randomUUID(),
    input.thread_id,
    'assistant',
    reply ?? FALLBACK[error ?? 'ai_unavailable'],
    calls.length ? calls : null,
    stamp(deps.now()),
  )
  await insertTurn(deps, [...toolRows, assistant])
  return {
    message: toChatMessage(userRow),
    tool_messages: toolRows.map((r) => toChatMessage(r)),
    reply: await withProposals(deps, assistant),
    error,
  }
}

/** Run one model call through the tools layer; failures go back to the model as {error, message}. */
async function runCall(
  deps: Deps,
  call: ModelCall,
  allowed: ReadonlyMap<string, OfferedTool>,
  asked: Asked,
  earlier: readonly ToolRun[],
): Promise<ToolRun> {
  const taken = new Set(earlier.map((r) => r.call.id))
  // Providers number calls per response, so the same id can come back in a later round.
  const id = taken.has(call.id) ? `${call.id}_${earlier.length}` : call.id
  const args = JSON.parse(JSON.stringify(call.args ?? {})) as StoredCall['args']
  const done = (ok: boolean, output: unknown, created: ProposalRef[] = []): ToolRun => {
    // Tool results carry free text (meal notes, the coach's dashboard note and narrative): the name never goes back.
    const content = redact(cap(JSON.stringify(output) ?? 'null'))
    return {
      call: { id, name: call.name, args, ok, ...(created.length ? { created } : {}) },
      content,
      forModel: ok ? `{"data":${content}}` : content,
      at: deps.now(),
    }
  }
  const offered = allowed.get(call.name)
  if (!offered)
    return done(false, {
      error: 'not_available',
      message: `${call.name} is not available in this chat; use the tools offered, or tell the user where in the app to do it.`,
    })
  if (offered.access === 'log' && !asksToLog(offered.tool.area, asked.message, asked.previousQuestion))
    return done(false, {
      error: 'needs_confirmation',
      message: `The user's message did not ask to log this, so ${call.name} did not run. Ask the user to confirm the exact value first; it runs once they say yes.`,
    })
  try {
    const output = await callTool(deps, call.name, call.args ?? {})
    return done(true, output, createdBy(call.name, output))
  } catch (e) {
    if (e instanceof HttpError) return done(false, { error: e.code, message: e.message })
    console.warn(JSON.stringify({ at: 'ask_ai', event: 'tool_failed', tool: call.name, error: e instanceof Error ? e.name : 'unknown' }))
    return done(false, { error: 'failed', message: `${call.name} failed unexpectedly` })
  }
}

function cap(text: string): string {
  if (text.length <= MAX_TOOL_CHARS) return text
  return JSON.stringify({
    truncated: true,
    note: `The result was ${text.length} characters; only the start is shown. Ask for less (a shorter range, a filter, a limit).`,
    start: text.slice(0, MAX_TOOL_CHARS - 300),
  })
}

function row(
  id: string,
  thread_id: string,
  role: ChatRow['role'],
  content: string,
  tool_calls: StoredCall[] | null,
  at: Date,
): ChatRow {
  const created_at = at.toISOString()
  return { id, thread_id, role, content, tool_calls, created_at, updated_at: created_at }
}

/** A message id seen before: the stored turn that followed it (or the calm fallback while it is still running). */
async function replayTurn(deps: Deps, messageId: string): Promise<ChatSent> {
  const first = await messageById(deps, messageId)
  if (!first) throw new HttpError(409, 'chat_conflict', 'The message could not be stored; send it again')
  const rows = await threadRows(deps, first.thread_id)
  const at = rows.findIndex((r) => r.id === messageId)
  const after = rows.slice(at + 1)
  const next = after.findIndex((r) => r.role === 'user')
  const turn = next === -1 ? after : after.slice(0, next)
  const tools = turn.filter((r) => r.role === 'tool')
  const assistant = turn.find((r) => r.role === 'assistant')
  const fallback = Object.entries(FALLBACK).find(([, text]) => text === assistant?.content)?.[0] as ChatTurnError | undefined
  return {
    message: toChatMessage(first),
    tool_messages: tools.map((r) => toChatMessage(r)),
    reply: assistant
      ? await withProposals(deps, assistant)
      : toChatMessage(row(crypto.randomUUID(), first.thread_id, 'assistant', FALLBACK.ai_unavailable, null, deps.now())),
    error: assistant ? (fallback ?? null) : 'ai_unavailable',
  }
}
