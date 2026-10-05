// Owns: calling a tool by name with untrusted input — refuse arguments the tool does not take, validate input with its
// Zod schema, run with deps, return the output (validated in dev). Ask AI and MCP both call through here, so
// validation and actor recording can't drift.
import * as z from 'zod'
import type { Deps } from '../../../lib/deps'
import { HttpError } from '../../../lib/http-error'
import { findTool, toolJsonSchemas } from './registry'
import { unknownKeys } from './strict'

const invalid = (name: string, why: string) => new HttpError(400, 'invalid_tool_input', `Invalid input for ${name}: ${why}`)

export async function callTool(deps: Deps, name: string, rawInput: unknown): Promise<unknown> {
  const tool = findTool(name)
  if (!tool) throw new HttpError(404, 'unknown_tool', `No tool named ${name}`)
  const input = rawInput ?? {}
  let parsed: ReturnType<typeof tool.input.safeParse>
  try {
    parsed = tool.input.safeParse(input)
  } catch (err) {
    // A schema step that throws on a value it cannot read (e.g. an unparseable instant) is still the caller's input.
    throw invalid(name, `a value could not be read (${err instanceof Error ? err.message : String(err)})`)
  }
  const unknown = unknownKeys(toolJsonSchemas(tool).input, input)
  const problems = [
    ...(unknown.length > 0 ? [`✖ Unknown argument: ${unknown.join(', ')} (check the spelling against the input schema)`] : []),
    ...(parsed.success ? [] : [z.prettifyError(parsed.error)]),
  ]
  if (problems.length > 0 || !parsed.success) throw invalid(name, problems.join('\n'))
  const out = await tool.run(deps, parsed.data)
  if (deps.env.DEV_AUTH_BYPASS === '1') {
    const r = tool.output.safeParse(out)
    if (!r.success) throw new HttpError(500, 'invalid_tool_output', `${name} broke its output schema: ${z.prettifyError(r.error)}`)
  }
  return out
}
