// Owns: running one tool call for an Ask AI turn through the tools layer as actor 'ai', and the run as stored and as
// the model reads it. Two entry points: a model call (only offered tools; a logging call needs the user's own words to
// ask for it — asksToLog — or the model gets needs_confirmation), and a dump fact (the message's extraction step: the
// dump is the request to log, so the gate is skipped, but only tools the policy allows as log/propose may run).
// Failures go back as {error, message}; an unexpected failure is logged by name only (message content never is).
import type { Deps } from '../../../lib/deps'
import { HttpError } from '../../../lib/http-error'
import { redactName } from '../../../lib/redact'
import type { ToolCall as ModelCall } from '../../llm'
import { callTool, findTool } from '../../tools'
import { accessOf } from './policy'
import { createdBy } from './proposals'
import { asksToLog, type OfferedTool } from './select'
import type { ProposalRef, StoredCall } from './store'

/** A tool result longer than this reaches the model (and the stored row) cut, with a note to ask more narrowly. */
const MAX_TOOL_CHARS = 12_000

export interface ToolRun {
  call: StoredCall
  /** The result as stored and shown in the app (JSON). */
  content: string
  /** What the model reads: a result wrapped as {"data": …}; a refusal or error ({error, message}) as is. */
  forModel: string
  at: Date
  /** The tool's output (successful runs only), for the dump step's receipts. */
  output?: unknown
}

/** What the turn knows about the user's own words, to decide whether a logging call may apply. */
export interface Asked {
  message: string
  previousQuestion: string | null
}

/** Providers number calls per response, so the same id can come back in a later round. */
function uniqueId(id: string, earlier: readonly ToolRun[]): string {
  return earlier.some((r) => r.call.id === id) ? `${id}_${earlier.length}` : id
}

function done(
  deps: Deps,
  id: string,
  name: string,
  args: StoredCall['args'],
  ok: boolean,
  output: unknown,
  created: ProposalRef[] = [],
): ToolRun {
  // Tool results carry free text (meal notes, the coach's dashboard note and narrative): the name never goes back.
  const content = redactName(cap(JSON.stringify(output) ?? 'null'))
  return {
    call: { id, name, args, ok, ...(created.length ? { created } : {}) },
    content,
    forModel: ok ? `{"data":${content}}` : content,
    at: deps.now(),
    ...(ok ? { output } : {}),
  }
}

async function execute(deps: Deps, id: string, name: string, raw: unknown): Promise<ToolRun> {
  const args = JSON.parse(JSON.stringify(raw ?? {})) as StoredCall['args']
  try {
    const output = await callTool(deps, name, raw ?? {})
    return done(deps, id, name, args, true, output, createdBy(name, output))
  } catch (e) {
    if (e instanceof HttpError)
      return done(deps, id, name, args, false, { error: e.code, message: e.message })
    console.warn(
      JSON.stringify({
        at: 'ask_ai',
        event: 'tool_failed',
        tool: name,
        error: e instanceof Error ? e.name : 'unknown',
      }),
    )
    return done(deps, id, name, args, false, { error: 'failed', message: `${name} failed unexpectedly` })
  }
}

/** Run one model call through the tools layer; failures go back to the model as {error, message}. */
export async function runCall(
  deps: Deps,
  call: ModelCall,
  allowed: ReadonlyMap<string, OfferedTool>,
  asked: Asked,
  earlier: readonly ToolRun[],
): Promise<ToolRun> {
  const id = uniqueId(call.id, earlier)
  const args = JSON.parse(JSON.stringify(call.args ?? {})) as StoredCall['args']
  const offered = allowed.get(call.name)
  if (!offered)
    return done(deps, id, call.name, args, false, {
      error: 'not_available',
      message: `${call.name} is not available in this chat; use the tools offered, or tell the user where in the app to do it.`,
    })
  if (offered.access === 'log' && !asksToLog(offered.tool.area, asked.message, asked.previousQuestion))
    return done(deps, id, call.name, args, false, {
      error: 'needs_confirmation',
      message: `The user's message did not ask to log this, so ${call.name} did not run. Ask the user to confirm the exact value first; it runs once they say yes.`,
    })
  return execute(deps, id, call.name, call.args)
}

/**
 * Run one fact from the message's dump: the user's message is the request to log it, so asksToLog does not apply; the
 * tool must still be a log or propose tool under the policy (fail closed), and Zod and the guards check it as usual.
 */
export async function runDumpCall(
  deps: Deps,
  name: string,
  args: Record<string, unknown>,
  earlier: readonly ToolRun[],
): Promise<ToolRun> {
  const id = uniqueId(`dump_${earlier.length}`, earlier)
  const tool = findTool(name)
  const access = tool ? accessOf(tool, false) : null
  if (access !== 'log' && access !== 'propose')
    return done(deps, id, name, JSON.parse(JSON.stringify(args)) as StoredCall['args'], false, {
      error: 'not_available',
      message: `${name} is not available`,
    })
  return execute(deps, id, name, args)
}

function cap(text: string): string {
  if (text.length <= MAX_TOOL_CHARS) return text
  return JSON.stringify({
    truncated: true,
    note: `The result was ${text.length} characters; only the start is shown. Ask for less (a shorter range, a filter, a limit).`,
    start: text.slice(0, MAX_TOOL_CHARS - 300),
  })
}
