// Owns: the shape of one tool in the shared tools layer (SPEC §10) and the defineTool helper.
// A tool is defined once — Zod input/output, MCP annotations, and a run() over Deps — and exposed to both
// Ask AI (Gemini function calling) and the MCP server. Writes record deps.actor and go through the guards
// inside the modules they call; no tool can change the settings rails.
import type * as z from 'zod'
import type { Deps } from '../../../lib/deps'

export type ToolArea =
  | 'day'
  | 'body'
  | 'plan'
  | 'nutrition'
  | 'fasting'
  | 'health'
  | 'training'
  | 'scans'
  | 'reviews'
  | 'week_plans'
  | 'coach'
  | 'metrics'

export interface ToolDefinition<I extends z.ZodType = z.ZodType, O extends z.ZodType = z.ZodType> {
  /** snake_case, as in SPEC §10 (e.g. get_today, apply_review). */
  name: string
  title: string
  /** What the model reads to decide when to call it. Lead with the GLOSSARY term; say what changes, if anything. */
  description: string
  area: ToolArea
  input: I
  output: O
  annotations: {
    /** True when the tool never writes. Every tool declares both hints (Claude requires it). */
    readOnlyHint: boolean
    /** True when the write can't be undone by a revert (rare: nothing here deletes history). */
    destructiveHint: boolean
    idempotentHint?: boolean
  }
  run: (deps: Deps, input: z.output<I>) => Promise<z.input<O>>
}

export function defineTool<I extends z.ZodType, O extends z.ZodType>(tool: ToolDefinition<I, O>): ToolDefinition<I, O> {
  return tool
}
