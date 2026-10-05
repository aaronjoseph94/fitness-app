// Owns: one MCP server instance for one request (SPEC §8 "MCP connector", §10): every tool in the tools layer, the four
// coach procedures as prompts, the fitness:// resources, and the server instructions. Tools run through callTool with
// deps.actor = 'mcp', so the same Zod validation, guards and versioning apply as for the app and Ask AI.
import { addDays, isoWeek, isoWeekRange, today } from '@fitness/shared/engine'
import {
  McpServer,
  ProtocolError,
  ProtocolErrorCode,
  ResourceTemplate,
  type CallToolResult,
  type ReadResourceResult,
} from '@modelcontextprotocol/server'
import type { Deps } from '../../../lib/deps'
import { HttpError } from '../../../lib/http-error'
import { allTools, callTool, PROCEDURE_NAMES, PROCEDURES } from '../../tools'
import { inputSchemaFor, type ToolArgs } from './schemas'

const SERVER_INFO = { name: 'fitness', title: 'Fitness tracker', version: '1.0.0' } as const

/** Read by the model on connect. No personal names (privacy rail); the procedures carry the detail. */
const INSTRUCTIONS = `Single-user fitness tracker: weight trend and forecast, nutrition, water, fasting, sleep and steps, training, Evolt scans, weekly reviews and week plans. The app's engine computes every number (trend weight, expenditure estimate, forecast, progression); you read the computed state, judge, and propose.

Before a coaching task — weekly review, scan debrief, program design or plateau check — call get_procedure with coach_review, scan_debrief, program_design or plateau_check and follow it (the same text is offered as MCP prompts). "Run my coach review" means get_procedure("coach_review"). For a quick question start with get_today (one day) or get_review_bundle (a week, aggregates only).

Writes apply immediately, are recorded with actor "mcp", and are versioned and revertible (revert_review, revert_week_plan, restore_plan_version). Agree each change with the user in the chat before calling a write tool. Every write passes the same guards as the app: daily kcal between the calorie floor and ceiling, at most 150 kcal per change, protein and fat at or above their minimums, allowed exercises only (machines and free weights), 12–28 sets per session, two 24 h fasts a month. A change that breaks a rail is dropped and reported with its rule; the rails themselves cannot be changed by any tool. No medical advice: a plateau or a worrying flag is a conversation with the user's doctor or dietitian.

Dates are America/Edmonton local dates (YYYY-MM-DD), weeks are ISO weeks (YYYY-Www, Monday–Sunday). Units: kg, cm, ml, kcal, g. Resources: fitness://today, fitness://plan and fitness://week/{YYYY-Www} return the same JSON as get_today, get_plan and get_week_plan.`

/** Build the server for one request (stateless: a new instance per HTTP request). */
export function buildServer(deps: Deps): McpServer {
  const server = new McpServer(SERVER_INFO, {
    instructions: INSTRUCTIONS,
    capabilities: { tools: {}, prompts: {}, resources: {} },
  })

  for (const tool of allTools()) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: inputSchemaFor(tool),
        annotations: { title: tool.title, ...tool.annotations },
      },
      (args: ToolArgs) => runTool(deps, tool.name, args),
    )
  }

  for (const name of PROCEDURE_NAMES) {
    const p = PROCEDURES[name]
    server.registerPrompt(name, { title: p.title, description: p.description }, () => ({
      description: p.description,
      messages: [{ role: 'user', content: { type: 'text', text: p.text } }],
    }))
  }

  server.registerResource(
    'today',
    'fitness://today',
    { title: 'Today', description: 'Today in Edmonton, exactly as get_today returns it.', mimeType: 'application/json' },
    async (uri) => json(uri, await callTool(deps, 'get_today', {})),
  )
  server.registerResource(
    'plan',
    'fitness://plan',
    { title: 'Active plan', description: 'The active plan version with the rails, exactly as get_plan returns it.', mimeType: 'application/json' },
    async (uri) => json(uri, await callTool(deps, 'get_plan', {})),
  )
  server.registerResource(
    'week',
    new ResourceTemplate('fitness://week/{week}', {
      // This week and next week, so clients can list concrete weeks.
      list: () => {
        const thisWeek = isoWeek(today(deps.now()))
        const nextWeek = isoWeek(addDays(isoWeekRange(thisWeek).from, 7))
        return { resources: [thisWeek, nextWeek].map((w) => ({ uri: `fitness://week/${w}`, name: `Week ${w}`, mimeType: 'application/json' })) }
      },
    }),
    {
      title: 'Week plan',
      description: "One ISO week's plan (YYYY-Www) with last week's actuals beside it, exactly as get_week_plan returns it.",
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const week = String(variables.week ?? '')
      let monday: string
      try {
        monday = isoWeekRange(week).from
      } catch {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Not an ISO week: "${week}" (expected YYYY-Www, e.g. 2026-W41)`)
      }
      return json(uri, await callTool(deps, 'get_week_plan', { week_start: monday }))
    },
  )

  return server
}

function json(uri: URL, value: unknown): ReadResourceResult {
  return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(value) }] }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Run one tool: the result as structuredContent plus the same JSON as text; any failure as an MCP tool error. */
async function runTool(deps: Deps, name: string, args: ToolArgs): Promise<CallToolResult> {
  const started = Date.now()
  try {
    const out = await callTool(deps, name, args)
    log('info', name, started)
    return {
      content: [{ type: 'text', text: JSON.stringify(out ?? null) }],
      structuredContent: isRecord(out) ? out : { result: out ?? null },
    }
  } catch (err) {
    return toolError(name, err, started)
  }
}

/** HttpError → "code: message" (+ details as JSON) so the model can fix its input; anything else is logged in full. */
function toolError(name: string, err: unknown, started: number): CallToolResult {
  if (err instanceof HttpError) {
    log(err.status >= 500 ? 'error' : 'warn', name, started, `${err.code}: ${err.message}`)
    const details = err.details === undefined ? '' : `\n${JSON.stringify(err.details)}`
    return { isError: true, content: [{ type: 'text', text: `${err.code}: ${err.message}${details}` }] }
  }
  const message = err instanceof Error ? err.message : String(err)
  log('error', name, started, message, err instanceof Error ? err.stack : undefined)
  return { isError: true, content: [{ type: 'text', text: `internal: ${name} failed on the server (${message})` }] }
}

function log(level: 'info' | 'warn' | 'error', tool: string, started: number, error?: string, stack?: string) {
  const line = JSON.stringify({ level, msg: 'mcp tool', tool, ms: Date.now() - started, ...(error && { error }), ...(stack && { stack }) })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}
