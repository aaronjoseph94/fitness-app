// Owns: the list of every tool and per-isolate caches (JSON Schemas built once; free-plan CPU budget).
// Tool files register by being listed in TOOL_SETS below — one array per area, each in its own file under lib/sets/.
import * as z from 'zod'
import type { ToolDefinition } from './define'
import { TOOL_SETS } from './sets'

type JsonSchema = Record<string, unknown>

let all: readonly ToolDefinition[] | undefined
const inputSchemas = new Map<string, JsonSchema>()
const outputSchemas = new Map<string, JsonSchema>()

export function allTools(): readonly ToolDefinition[] {
  if (!all) {
    const seen = new Set<string>()
    all = TOOL_SETS.flat().filter((t) => {
      if (seen.has(t.name)) throw new Error(`Duplicate tool name: ${t.name}`)
      seen.add(t.name)
      return true
    })
  }
  return all
}

export function findTool(name: string): ToolDefinition | undefined {
  return allTools().find((t) => t.name === name)
}

function cached(cache: Map<string, JsonSchema>, tool: ToolDefinition, side: 'input' | 'output'): JsonSchema {
  let s = cache.get(tool.name)
  if (!s) {
    const { $schema: _drop, ...rest } = z.toJSONSchema(tool[side], { io: side, unrepresentable: 'any' }) as JsonSchema
    s = rest
    cache.set(tool.name, s)
  }
  return s
}

/**
 * JSON Schema for a tool's input and output, each computed once per isolate (z.toJSONSchema is the expensive part).
 * `input` is built now (MCP's tools/list advertises it; the MCP module warms every input at isolate start-up);
 * `output` only when first read — MCP does not list output schemas, and building them all costs ~80 ms of start-up.
 */
export function toolJsonSchemas(tool: ToolDefinition): { input: JsonSchema; readonly output: JsonSchema } {
  const input = cached(inputSchemas, tool, 'input')
  return {
    input,
    get output() {
      return cached(outputSchemas, tool, 'output')
    },
  }
}
