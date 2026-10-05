// Owns: the MCP server's interface (SPEC §8 "MCP connector", §10) — serve one authenticated /mcp request with every
// tools-layer tool (input JSON Schemas precomputed per isolate), the coach procedures as prompts, and the
// fitness://today, fitness://plan and fitness://week/{YYYY-Www} resources. deps.actor must be 'mcp'; who may call is
// decided before this (middleware/mcp-auth.ts: static bearer or OAuth 2.1 access token).
export { serveMcp } from './lib/serve'
