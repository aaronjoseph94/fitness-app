// Owns: the list of tool sets. Each area's tools live in lib/sets/<area>.ts and are added here (one import + one entry).
import type { ToolDefinition } from './define'

export const TOOL_SETS: ReadonlyArray<readonly ToolDefinition[]> = []
