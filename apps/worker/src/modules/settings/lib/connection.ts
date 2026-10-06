// Owns: how Claude reaches the app (SPEC §8 \"MCP connector\") — the connector URL for the origin Aaron is using, the
// two discovery URLs Claude's client probes, the bearer token's status, and the newest MCP write as evidence the
// connector has actually been used.
import { desc, eq } from 'drizzle-orm'
import type { McpConnectionView } from '@fitness/shared/schemas'
import { ai_events } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { listSecrets } from '../../secrets'

/** GET /api/settings/connection. `origin` is the origin this request arrived on (workers.dev, a custom domain or wrangler dev). */
export async function getMcpConnection(deps: Deps, origin: string): Promise<McpConnectionView> {
  const [secrets, writes] = await Promise.all([
    listSecrets(deps),
    // MCP writes are the only rows actor 'mcp' creates, so the newest one dates the last real Claude session.
    deps.db
      .select({ created_at: ai_events.created_at })
      .from(ai_events)
      .where(eq(ai_events.actor, 'mcp'))
      .orderBy(desc(ai_events.created_at))
      .limit(1),
  ])
  const bearer = secrets.secrets.find((s) => s.name === 'MCP_BEARER_TOKEN')
  return {
    mcp_url: `${origin}/mcp`,
    authorization_server_url: `${origin}/.well-known/oauth-authorization-server`,
    protected_resource_url: `${origin}/.well-known/oauth-protected-resource/mcp`,
    bearer_configured: bearer !== undefined && bearer.source !== 'none',
    bearer_source: bearer?.source ?? 'none',
    last_write_at: writes[0]?.created_at ?? null,
  }
}
