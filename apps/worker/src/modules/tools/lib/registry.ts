// Owns: the list of every tool and per-isolate caches (JSON Schemas built once; free-plan CPU budget).
// Tool files register by being listed in TOOL_SETS below — one array per area, each in its own file under lib/sets/.
import * as z from 'zod'
import type { ToolDefinition } from './define'
import { TOOL_SETS } from './sets'

let all: readonly ToolDefinition[] | undefined
const jsonSchemas = new Map<string, { input: Record<string, unknown>; output: Record<string, unknown> }>()

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

/** JSON Schema for a tool's input and output, computed once per isolate (z.toJSONSchema is the expensive part). */
export function toolJsonSchemas(tool: ToolDefinition): { input: Record<string, unknown>; output: Record<string, unknown> } {
  let s = jsonSchemas.get(tool.name)
  if (!s) {
    const strip = (o: Record<string, unknown>) => {
      const { $schema: _drop, ...rest } = o
      return rest
    }
    s = {
      input: strip(z.toJSONSchema(tool.input, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>),
      output: strip(z.toJSONSchema(tool.output, { io: 'output', unrepresentable: 'any' }) as Record<string, unknown>),
    }
    jsonSchemas.set(tool.name, s)
  }
  return s
}
