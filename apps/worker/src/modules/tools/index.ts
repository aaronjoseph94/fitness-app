// Owns: the public surface of the shared tools layer (SPEC §10) used by Ask AI and the MCP server.
// Interface:
//   allTools()                         → readonly ToolDefinition[]  every tool, each name once (lib/sets)
//   findTool(name)                     → ToolDefinition | undefined
//   toolJsonSchemas(tool)              → { input, output }  JSON Schemas, built once per isolate (output on first read)
//   callTool(deps, name, rawInput)     → output  404 unknown_tool; unknown arguments refused and input validated with
//                                        the tool's Zod schema (400 invalid_tool_input); run as deps.actor
//   PROCEDURES / PROCEDURE_NAMES / getProcedure(name) → Procedure  the coach procedures (MCP prompts, get_procedure)
//   types ToolArea, ToolDefinition, Procedure, ProcedureName
export { type ToolArea, type ToolDefinition } from './lib/define'
export { allTools, findTool, toolJsonSchemas } from './lib/registry'
export { callTool } from './lib/call'
export {
  getProcedure,
  PROCEDURE_NAMES,
  PROCEDURES,
  type Procedure,
  type ProcedureName,
} from './lib/procedures'
