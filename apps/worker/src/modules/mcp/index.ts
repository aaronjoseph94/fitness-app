// Owns: the MCP server's interface (SPEC §8 "MCP connector", §10) — serve one authenticated /mcp request with the
// tools-layer tools its access level allows (input JSON Schemas precomputed per isolate), the coach procedures as
// prompts, and the fitness://today, fitness://plan and fitness://week/{YYYY-Www} resources. deps.actor must be 'mcp';
// who may call, and at which access level, is decided before this (middleware/mcp-auth.ts: static bearer or OAuth 2.1
// access token).
// Interface:
//   serveMcp(request, deps, access) → Response  access 'full': every tool and the procedures as prompts (Claude, the
//                                              static bearer); 'log': read tools and logging tools only (Meta Muse)
//   type McpAccess = 'full' | 'log'
export { serveMcp } from './lib/serve'
export type { McpAccess } from './lib/access'
