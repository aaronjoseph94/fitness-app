// Owns: one Ask AI turn, answered inside the request — claim the message id (a replayed id returns the stored turn),
// run the dump step (lib/dump: extract what the message says happened, log each fact through the tools layer as actor
// 'ai' with a receipt, propose equipment and goal changes), store the receipts with a running placeholder reply in one
// batch, reforecast when a log moves the forecast, then offer the model the tools picked by intent and run its tool
// calls for at most MAX_ROUNDS model calls, fill in the placeholder with the tool rows in one batch, start the dump's
// meal analyses, and return the reply with the calls it made, the proposals it created (status now), the receipts and
// the forecast's move. A router failure becomes a calm stored reply, never an HTTP error, and the dump step never
// breaks a turn (a failed extraction just means no dump).
// Durability: once facts are logged, their receipts and the placeholder (running) are stored together, so a replay of
// the message id (a retry while it runs, or after the isolate died) returns those receipts — error 'turn_running' while
// the placeholder is fresh, 'ai_unavailable' with "I logged these; the answer was cut off" once it is older than
// RUNNING_STALE_MS. A replay never logs again. (Between the facts' writes and that batch there is a short window where
// a dying isolate leaves facts without receipts; they are still in Log.)
// Prompt injection (OWASP LLM01): a tool result and the dump's note reach the model as {"data": …} (data, never
// instructions), and a logging call from the tool loop (which applies at once) runs only when the user's own message
// asks to log in that area; otherwise the model gets needs_confirmation and must ask. Text from a food database, a
// note or a screenshot can't trigger a write by itself: the tools are picked from his own text (and the question
// before a "yes"), and a "yes" after a message that already logged something does not reach back to that message.
import { today } from '@fitness/shared/engine'
import type { ChatSend, ChatSent, ChatTurnError, ForecastShift } from '@fitness/shared/schemas'
import type * as z from 'zod'
import { chat_messages, runBatch } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { HttpError } from '../../../lib/http-error'
import { redactName } from '../../../lib/redact'
import { attachmentImages } from '../../attachments'
import { activeBodyNotes } from '../../body-notes'
import { runSoon } from '../../jobs'
import { ProvidersExhaustedError, type LlmRouter, type Msg, type ToolDef } from '../../llm'
import { deferMealAnalysis } from '../../nutrition'
import { getActivePlan, reforecast } from '../../plan'
import { getSettings } from '../../settings'
import { toolJsonSchemas, type ToolDefinition } from '../../tools'
import { runCall, runDumpCall, type Asked, type ToolRun } from './calls'
import { applyDump, coachNote, dumpRef, extractDump, wantsExtraction, type Applied, type Dump } from './dump'
import { replyMessage } from './history'
import { systemPrompt } from './prompt'
import { movesForecast, receiptInserts, receiptsOf } from './receipts'
import { selectTools } from './select'
import {
  FALLBACK,
  NOT_SET_UP,
  NOT_SET_UP_BEFORE,
  RUNNING,
  finishTurn,
  history,
  isStale,
  messageById,
  placeholderInsert,
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

  // A "yes" reaches back to the question before it only when that question logged nothing: otherwise "yes" (or "ok,
  // thanks") after a dump would count as asking to log its meal or weight again.
  const previousLogged =
    past.lastAnswerId !== null &&
    ((await receiptsOf(deps, [past.lastAnswerId])).get(past.lastAnswerId)?.length ?? 0) > 0
  const previousQuestion = previousLogged ? null : past.lastQuestion

  const ai: Deps = { ...deps, actor: 'ai' }
  const runs: ToolRun[] = []
  const placeholder = row(
    crypto.randomUUID(),
    input.thread_id,
    'assistant',
    '',
    null,
    later(started, deps.now()),
  )
  const ref = dumpRef(started, input.sent_at)
  const dump = await runDump(deps, llm, { input, started, ref, runs })

  // The receipts and the running placeholder in one batch: from here a replay returns what was logged.
  await runBatch(deps.db, [
    placeholderInsert(deps, placeholder),
    ...receiptInserts(deps, { id: placeholder.id, thread_id: input.thread_id }, dump?.applied.receipts ?? []),
  ])
  const after = dump ? await afterDump(deps, dump, started) : { note: null, forecast: null }

  // The coach pass: tools for his own words (and the question before a "yes"); a log tool the dump already ran, or
  // propose_goal_change when the dump proposed the goal, is not offered again, so nothing is done twice.
  const skip = new Set<string>(dump?.applied.logged ?? [])
  if (dump?.applied.goalProposed) skip.add('propose_goal_change')
  const offered = selectTools(
    [input.content, ...(previousQuestion ? [previousQuestion] : [])],
    settings.auto_apply_safe,
  ).filter((o) => !skip.has(o.tool.name))
  const tools = offered.map(({ tool }) => toolDef(tool))
  const allowed = new Map(offered.map((o) => [o.tool.name, o]))
  const asked: Asked = { message: input.content, previousQuestion }
  const own = redactName(input.content)
  // The dump's note goes in his turn, before his words, as data (the system prompt stays the app's own instructions);
  // one user message, so the roles still alternate as every provider expects.
  const messages: Msg[] = [
    ...past.messages.map((m) => ({ ...m, content: redactName(m.content) })),
    { role: 'user', content: after.note ? `${JSON.stringify({ data: after.note })}\n\n${own}` : own },
  ]
  const system = systemPrompt(started, settings)
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
    placeholder.id,
    input.thread_id,
    'assistant',
    reply ?? (notSetUp ? NOT_SET_UP : FALLBACK[error ?? 'ai_unavailable']),
    calls.length ? calls : null,
    stamp(deps.now()),
    after.forecast,
  )
  await finishTurn(deps, toolRows, assistant)
  // The dump's meals were queued without starting (deferMealAnalysis): their model calls start now, after the coach
  // pass, so they never compete with it for the request's subrequest budget. They run in the request's waitUntil.
  for (const id of dump?.applied.mealJobs ?? []) runSoon(deps, id)
  return {
    message: toChatMessage(userRow),
    tool_messages: toolRows.map((r) => toChatMessage(r)),
    reply: await replyMessage(deps, assistant),
    error,
  }
}

/** An instant strictly after `at` (the placeholder sorts after the user row). */
const later = (at: Date, now: Date) => new Date(Math.max(at.getTime() + 1, now.getTime()))

interface DumpRun {
  dump: Dump | null
  applied: Applied
}

/**
 * Extract (with the message's screenshots) and apply the facts and attachments. Null when there is nothing to apply
 * (no extraction, or it failed, and no meal photo or scan sheet). Never throws: whatever fails is logged by name and
 * the turn goes on with what was applied.
 */
async function runDump(
  deps: Deps,
  llm: LlmRouter,
  ctx: { input: ChatSend; started: Date; ref: Date; runs: ToolRun[] },
): Promise<DumpRun | null> {
  const { input, started, ref, runs } = ctx
  // Facts run as 'ai', and a meal's analysis waits for the end of the turn.
  const ai = deferMealAnalysis({ ...deps, actor: 'ai' })
  try {
    let dump: Dump | null = null
    const ids = input.attachments.flatMap((a) => (a.tag === 'screenshot' ? [a.id] : []))
    if (wantsExtraction(input.content, input.attachments)) {
      const images = ids.length
        ? ((await attachmentImages(deps, { ids, message_id: input.id }).catch(warn('screenshots_failed'))) ??
          [])
        : []
      const left = TURN_BUDGET_MS - (deps.now().getTime() - started.getTime())
      dump = await extractDump(llm, {
        ref,
        content: input.content,
        images,
        deadlineMs: Math.min(CALL_DEADLINE_MS, left),
      })
    }
    if (!dump && !input.attachments.some((a) => a.tag !== 'screenshot')) return null
    const applied = await applyDump(
      ai,
      dump,
      input.attachments,
      async (name, args) => {
        const run = await runDumpCall(ai, name, args, runs)
        runs.push(run)
        return run
      },
      { ref, content: input.content, screenshots: ids.length > 0 },
    )
    return { dump, applied }
  } catch (e) {
    warn('dump_failed')(e)
    return null
  }
}

/**
 * After the receipts are stored: reforecast when a log moves the forecast (a dump's text meal is still parsing, so a
 * meal alone does not), and the coach pass's note. Never throws.
 */
async function afterDump(
  deps: Deps,
  { dump, applied }: DumpRun,
  started: Date,
): Promise<{ note: string | null; forecast: ForecastShift | null }> {
  const day = today(started)
  let forecast: ForecastShift | null = null
  if (applied.receipts.some((r) => r.kind !== 'meal' && movesForecast(r.kind))) {
    forecast = await (async () => {
      const before = (await getActivePlan(deps)).forecast
      const after = await reforecast(deps, { as_of: day, reestimate: false })
      return { before, after }
    })().catch(warn('dump_reforecast_failed'))
  }
  const bodyNotes = (await activeBodyNotes(deps).catch(warn('body_notes_failed'))) ?? []
  try {
    return {
      note: coachNote({
        applied,
        forecast,
        bodyNotes,
        dump,
        backdated: applied.receipts.some((r) => r.date < day),
      }),
      forecast,
    }
  } catch (e) {
    warn('dump_note_failed')(e)
    return { note: null, forecast }
  }
}

const warn = (event: string) => (e: unknown) => {
  console.warn(JSON.stringify({ at: 'ask_ai', event, error: e instanceof Error ? e.name : 'unknown' }))
  return null
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
  return {
    id,
    thread_id,
    role,
    content,
    tool_calls,
    forecast,
    running: false,
    created_at,
    updated_at: created_at,
  }
}

/**
 * A message id seen before: the stored turn that followed it. Still running → its receipts so far and error
 * 'turn_running' (poll the thread for the answer); cut off (running past RUNNING_STALE_MS) → those receipts, "I logged
 * these; the answer was cut off — ask again" and 'ai_unavailable'. No reply row yet: 'turn_running' while the message
 * is fresh (it is still extracting), the calm ai_unavailable fallback once stale. Nothing runs or logs again.
 */
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
  const now = deps.now()
  const base = { message: toChatMessage(first), tool_messages: tools.map((r) => toChatMessage(r)) }
  if (!assistant) {
    const stale = isStale(first, now)
    const text = stale ? FALLBACK.ai_unavailable : RUNNING
    return {
      ...base,
      reply: toChatMessage(row(crypto.randomUUID(), first.thread_id, 'assistant', text, null, now)),
      error: stale ? 'ai_unavailable' : 'turn_running',
    }
  }
  if (assistant.running)
    return {
      ...base,
      reply: await replyMessage(deps, assistant, RUNNING),
      error: isStale(assistant, now) ? 'ai_unavailable' : 'turn_running',
    }
  const fallback =
    assistant.content === NOT_SET_UP || assistant.content === NOT_SET_UP_BEFORE
      ? 'ai_unavailable'
      : (Object.entries(FALLBACK).find(([, text]) => text === assistant.content)?.[0] as
          ChatTurnError | undefined)
  return { ...base, reply: await replyMessage(deps, assistant), error: fallback ?? null }
}
