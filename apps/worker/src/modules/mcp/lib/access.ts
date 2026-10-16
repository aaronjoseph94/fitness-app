// Owns: what each MCP access level may list and call (SPEC §8 "MCP connector"). 'full' (Claude, the static bearer):
// every tool. 'log' (Meta Muse): the read tools (but not the coach procedures, which direct plan writes) plus
// LOG_TOOLS, so plans, targets, templates, week plans, training days, equipment, reminders, proposal decisions and
// reverts stay with the app and Claude. Anything but 'full' gets the log set (fails closed).
import { allTools, type ToolDefinition } from '../../tools'

export type McpAccess = 'full' | 'log'

/** The writes a log-access client may make: entries of the day (meals, body, water, steps, sleep, fasts, sets). */
const LOG_TOOLS: ReadonlySet<string> = new Set([
  'log_meal',
  'confirm_meal',
  'log_weight',
  'log_measurement',
  'log_water',
  'log_steps',
  'log_sleep',
  'start_fast',
  'end_fast',
  'start_session',
  'log_set',
  'finish_session',
])

/** Read tools a log-access client doesn't get: the coach procedures direct plan writes it cannot make. */
const NOT_FOR_LOG: ReadonlySet<string> = new Set(['get_procedure'])

let logTools: readonly ToolDefinition[] | undefined

/** The tools an access level may list and call (the log set is built once per isolate). */
export function toolsFor(access: McpAccess): readonly ToolDefinition[] {
  if (access === 'full') return allTools()
  logTools ??= allTools().filter(
    (t) => (t.annotations.readOnlyHint && !NOT_FOR_LOG.has(t.name)) || LOG_TOOLS.has(t.name),
  )
  return logTools
}

/**
 * Why a call to a tool the access level lists may not run with these arguments, or null when it may. Log access:
 * start_session with a proposal_id accepts that AI draft, and deciding proposals stays in the app.
 */
export function refusedArgs(access: McpAccess, name: string, args: Record<string, unknown>): string | null {
  if (access === 'full') return null
  if (name === 'start_session' && args.proposal_id !== undefined)
    return 'Starting from an AI draft accepts it, which this connection cannot do: start it from its card in the app'
  return null
}
