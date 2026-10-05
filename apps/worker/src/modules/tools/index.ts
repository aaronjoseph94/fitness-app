// Owns: the public surface of the shared tools layer (SPEC §10) used by Ask AI and the MCP server.
export { defineTool, type ToolArea, type ToolDefinition } from './lib/define'
export { allTools, findTool, toolJsonSchemas } from './lib/registry'
export { callTool } from './lib/call'
