// Owns: one Ask AI turn, answered inside the request — claim the message id (a replayed id returns the stored turn),
// run the dump step (lib/dump: extract what the message says happened, log each fact through the tools layer as actor
// 'ai' with a receipt, propose equipment and goal changes, reforecast when a log moves the forecast), then offer the
// model the tools picked by intent and run its tool calls for at most MAX_ROUNDS model calls, store the user / tool /
// assistant rows, and return the reply with the calls it made, the proposals it created (status now), the receipts and
// the forecast's move. A router failure becomes a calm stored reply, never an HTTP error, and the dump step never
// breaks a turn (a failed extraction just means no dump).
// Prompt injection (OWASP LLM01): a tool result reaches the model as {"data": …} (data, never instructions), and a
// logging call from the tool loop (which applies at once) runs only when the user's own message asks to log in that
// area; otherwise the model gets needs_confirmation and must ask. Text from a food database or a note can't trigger a
// write by itself. The dump's facts come only from the user's own message (and the screenshots he attached).
import { today } from '@fitness/shared/engine'
import type { ChatSend, ChatSent, ChatTurnError, ForecastShift } from '@fitness/shared/schemas'
import type * as z from 'zod'
import { chat_messages } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { HttpError } from '../../../lib/http-error'
import { redactName } from '../../../lib/redact'
import { attachmentImages } from '../../attachments'
import { activeBodyNotes } from '../../body-notes'
import { ProvidersExhaustedError, type LlmRouter, type Msg, type ToolDef } from '../../llm'
import { getActivePlan, reforecast } from '../../plan'
import { getSettings } from '../../settings'
import { toolJsonSchemas, type ToolDefinition } from '../../tools'
import { runCall, runDumpCall, type Asked, type ToolRun } from './calls'
import { applyDump, coachNote, extractDump, wantsExtraction, type Applied } from './dump'
import { replyMessage } from './history'
import { systemPrompt } from './prompt'
import { insertReceipts, movesForecast } from './receipts'
import { selectTools } from './select'
import {
  FALLBACK,
  NOT_SET_UP,
  NOT_SET_UP_BEFORE,
  history,
  insertTurn,
  messageById,
  threadRows,
  toChatMessage,
  type ChatRow,
  type StoredCall,
} from './store'

/** Model calls per turn (each may ask for several tools). */
const MAX_ROUNDS = 5
/** Wall time for the whole turn; each model call gets what is left, up to the router's 25 s. */
const TURN_BUDGET_MS = 55_000
const CALL_DEADLINE_MS = 25_000
const MIN_CALL_MS = 3_000
const MAX_REPLY_TOKENS = 1_024

/**
 * Tool definitions as the model reads them (the descriptions name the user for the coach; redacted here), per isolate.
 * Parameters are the tools layer's JSON Schemas, warmed at isolate start-up, so no conversion runs in the request.
 */
const toolDefs = new Map<string, ToolDef>()
function toolDef(tool: ToolDefinition): ToolDef {
  let def = toolDefs.get(tool.name)
  if (!def) {
    def = {
      name: tool.name,
      description: redactName(tool.description),
      parameters: toolJsonSchemas(tool).input,
    }
    toolDefs.set(tool.name, def)
  }
  return def
}

/** The send body as a caller may give it (attachments default to none). */
export type ChatTurnInput = z.input<typeof ChatSend>

export async function chatTurn(deps: Deps, llm: LlmRouter, send: ChatTurnInput): Promise<ChatSent> {
  const input = { ...send, attachments: send.attachments ?? [] }
  const started = deps.now()
  const userRow = row(input.id, input.thread_id, 'user', input.content, null, started)
  const [{ settings }, past] = await Promise.all([getSettings(deps), history(deps, input.thread_id)])
  // Claim the id first: a retried send (double tap, flaky network) replays instead of logging twice.
  const claimed = await deps.db
    .insert(chat_messages)
    .values(userRow)
    .onConflictDoNothing()
    .returning({ id: chat_messages.id })
  if (claimed.length === 0) return replayTurn(deps, input.id)

  const ai: Deps = { ...deps, actor: 'ai' }
  const runs: ToolRun[] = []
  const assistantId = crypto.randomUUID()
  const dump = await dumpStep(deps, llm, { input, started, assistantId, runs })

  // The coach pass: tools for the message, its requests and questions (and the question before a "yes"); a log tool
  // the dump already ran is not offered again, so the same fact is never logged twice.
  const offered = selectTools(
    [input.content, ...dump.asks, ...(past.lastQuestion ? [past.lastQuestion] : [])],
    settings.auto_apply_safe,
  ).filter((o) => !(o.access === 'log' && dump.logged.has(o.tool.name)))
  const tools = offered.map(({ tool }) => toolDef(tool))
  const allowed = new Map(offered.map((o) => [o.tool.name, o]))
  const asked: Asked = { message: input.content, previousQuestion: past.lastQuestion }
  const system = dump.note
    ? `${systemPrompt(started, settings)}\n\n${dump.note}`
    : systemPrompt(started, settings)
  const messages: Msg[] = [
    ...past.messages.map((m) => ({ ...m, content: redactName(m.content) })),
    { role: 'user', content: redactName(input.content) },
  ]
  let reply: string | null = null
  let error: ChatTurnError | null = null
  /** Every provider was skipped for want of a key: the reply says Ask AI is not set up. */
  let notSetUp = false

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
      console.warn(
        JSON.stringify({ at: 'ask_ai', event: 'llm_failed', error: e instanceof Error ? e.name : 'unknown' }),
      )
      error = 'ai_unavailable'
      notSetUp =
        e instanceof ProvidersExhaustedError &&
        e.failures.length > 0 &&
        e.failures.every((f) => f.reason === 'no_key')
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
    assistantId,
    input.thread_id,
    'assistant',
    reply ?? (notSetUp ? NOT_SET_UP : FALLBACK[error ?? 'ai_unavailable']),
    calls.length ? calls : null,
    stamp(deps.now()),
    dump.forecast,
  )
  await insertTurn(deps, [...toolRows, assistant])
  return {
    message: toChatMessage(userRow),
    tool_messages: toolRows.map((r) => toChatMessage(r)),
    reply: await replyMessage(deps, assistant),
    error,
  }
}

interface DumpOutcome {
  /** The coach pass's note about the dump (null: nothing was extracted or attached). */
  note: string | null
  /** The message's requests and questions, for picking the coach pass's tools. */
  asks: string[]
  logged: ReadonlySet<string>
  forecast: ForecastShift | null
}

/**
 * The dump step: extract (with the message's screenshots), apply the facts and attachments, store their receipts on
 * the coming assistant row, and reforecast when a log moves the forecast. Never throws: whatever fails is logged by
 * name and the turn goes on with what was applied.
 */
async function dumpStep(
  deps: Deps,
  llm: LlmRouter,
  ctx: { input: ChatSend; started: Date; assistantId: string; runs: ToolRun[] },
): Promise<DumpOutcome> {
  const { input, started, runs } = ctx
  const none: DumpOutcome = { note: null, asks: [], logged: new Set(), forecast: null }
  const ai: Deps = { ...deps, actor: 'ai' }
  const warn = (event: string) => (e: unknown) => {
    console.warn(JSON.stringify({ at: 'ask_ai', event, error: e instanceof Error ? e.name : 'unknown' }))
    return null
  }
  try {
    let extraction = null
    if (wantsExtraction(input.content, input.attachments)) {
      const ids = input.attachments.flatMap((a) => (a.tag === 'screenshot' ? [a.id] : []))
      const images = ids.length
        ? ((await attachmentImages(deps, { ids, message_id: input.id }).catch(warn('screenshots_failed'))) ??
          [])
        : []
      const left = TURN_BUDGET_MS - (deps.now().getTime() - started.getTime())
      extraction = await extractDump(llm, {
        now: started,
        content: input.content,
        images,
        deadlineMs: Math.min(CALL_DEADLINE_MS, left),
      })
    }
    if (!extraction && !input.attachments.some((a) => a.tag !== 'screenshot')) return none

    const applied: Applied = await applyDump(ai, extraction, input.attachments, async (name, args) => {
      const run = await runDumpCall(ai, name, args, runs)
      runs.push(run)
      return run
    })
    if (applied.receipts.length)
      await insertReceipts(deps, { id: ctx.assistantId, thread_id: input.thread_id }, applied.receipts)

    const day = today(started)
    let forecast: ForecastShift | null = null
    if (applied.receipts.some((r) => movesForecast(r.kind))) {
      forecast = await (async () => {
        const before = (await getActivePlan(deps)).forecast
        const after = await reforecast(deps, { as_of: day, reestimate: false })
        return { before, after }
      })().catch(warn('dump_reforecast_failed'))
    }
    const bodyNotes = (await activeBodyNotes(deps).catch(warn('body_notes_failed'))) ?? []
    return {
      note: coachNote({
        applied,
        forecast,
        bodyNotes,
        dump: extraction,
        backdated: applied.receipts.some((r) => r.date < day),
      }),
      asks: [...(extraction?.requests ?? []), ...(extraction?.questions ?? [])],
      logged: applied.logged,
      forecast,
    }
  } catch (e) {
    warn('dump_failed')(e)
    return none
  }
}

function row(
  id: string,
  thread_id: string,
  role: ChatRow['role'],
  content: string,
  tool_calls: StoredCall[] | null,
  at: Date,
  forecast: ForecastShift | null = null,
): ChatRow {
  const created_at = at.toISOString()
  return { id, thread_id, role, content, tool_calls, forecast, created_at, updated_at: created_at }
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
  const fallback =
    assistant?.content === NOT_SET_UP || assistant?.content === NOT_SET_UP_BEFORE
      ? 'ai_unavailable'
      : (Object.entries(FALLBACK).find(([, text]) => text === assistant?.content)?.[0] as
          ChatTurnError | undefined)
  return {
    message: toChatMessage(first),
    tool_messages: tools.map((r) => toChatMessage(r)),
    reply: assistant
      ? await replyMessage(deps, assistant)
      : toChatMessage(
          row(crypto.randomUUID(), first.thread_id, 'assistant', FALLBACK.ai_unavailable, null, deps.now()),
        ),
    error: assistant ? (fallback ?? null) : 'ai_unavailable',
  }
}
