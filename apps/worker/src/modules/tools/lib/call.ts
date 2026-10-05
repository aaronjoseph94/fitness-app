// Owns: calling a tool by name with untrusted input — validate input with its Zod schema, run with deps, return the
// output (validated in dev). Ask AI and MCP both call through here, so validation and actor recording can't drift.
import * as z from 'zod'
import type { Deps } from '../../../lib/deps'
import { HttpError } from '../../../lib/http-error'
import { findTool } from './registry'

export async function callTool(deps: Deps, name: string, rawInput: unknown): Promise<unknown> {
  const tool = findTool(name)
  if (!tool) throw new HttpError(404, 'unknown_tool', `No tool named ${name}`)
  const parsed = tool.input.safeParse(rawInput ?? {})
  if (!parsed.success) throw new HttpError(400, 'invalid_tool_input', `Invalid input for ${name}: ${z.prettifyError(parsed.error)}`)
  const out = await tool.run(deps, parsed.data)
  if (deps.env.DEV_AUTH_BYPASS === '1') {
    const r = tool.output.safeParse(out)
    if (!r.success) throw new HttpError(500, 'invalid_tool_output', `${name} broke its output schema: ${z.prettifyError(r.error)}`)
  }
  return out
}
