// Owns: the input schema each tool advertises over MCP — a Standard Schema whose JSON Schema is the tools layer's cached
// one (toolJsonSchemas), built once per isolate at module scope (free plan: no z.toJSONSchema inside a request).
// validate() passes arguments through: callTool validates them with the tool's Zod schema, so the rules live in one
// place and Ask AI and MCP report the same errors. Output schemas are not advertised: they total ~440 KB across the
// tools (inputs ~50 KB) and would bloat tools/list and Claude's context; every result still carries structuredContent
// plus the same JSON as text. (toolJsonSchemas builds the input side here, at start-up; output sides are built only if
// something reads them, which saves ~80 ms per isolate.)
import type { StandardSchemaWithJSON } from '@modelcontextprotocol/server'
import { redactNameDeep } from '../../../lib/redact'
import { allTools, toolJsonSchemas, type ToolDefinition } from '../../tools'

export type ToolArgs = Record<string, unknown>

const byTool = new Map<string, StandardSchemaWithJSON<ToolArgs>>()

function passThrough(schema: Record<string, unknown>): StandardSchemaWithJSON<ToolArgs> {
  const json = redactNameDeep(schema) // parameter descriptions are read by the model too
  const convert = () => json
  return {
    '~standard': {
      version: 1,
      vendor: 'fitness-tools',
      validate: (value) => ({ value: (value ?? {}) as ToolArgs }),
      jsonSchema: { input: convert, output: convert },
    },
  }
}

/** The tool's input schema for registerTool (cached; built on first use if warm-up below skipped it). */
export function inputSchemaFor(tool: ToolDefinition): StandardSchemaWithJSON<ToolArgs> {
  let s = byTool.get(tool.name)
  if (!s) {
    s = passThrough(toolJsonSchemas(tool).input)
    byTool.set(tool.name, s)
  }
  return s
}

// Warm-up during isolate start-up (not billed to a request's CPU). A tool whose schema can't be built must not take
// the Worker down: log it and let the first tools/list try again.
try {
  for (const tool of allTools()) inputSchemaFor(tool)
} catch (err) {
  console.error(JSON.stringify({ level: 'error', msg: 'mcp: tool JSON Schema warm-up failed', error: String(err) }))
}
