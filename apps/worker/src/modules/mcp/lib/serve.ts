// Owns: serving one MCP HTTP request — Streamable HTTP, stateless (@modelcontextprotocol/server 2.3 createMcpHandler):
// a fresh server per request for both protocol eras (2026-07-28 per-request envelopes and the 2025-era stateless
// fallback, where GET/DELETE answer 405). Auth happened before this point (middleware/mcp-auth.ts).
import { createMcpHandler } from '@modelcontextprotocol/server'
import type { Deps } from '../../../lib/deps'
import { buildServer } from './server'

export function serveMcp(request: Request, deps: Deps): Promise<Response> {
  const handler = createMcpHandler(() => buildServer(deps), {
    onerror: (err) => console.warn(JSON.stringify({ level: 'warn', msg: 'mcp: request rejected or failed', error: err.message })),
  })
  return handler.fetch(request)
}
