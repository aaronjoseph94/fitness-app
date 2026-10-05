// Owns: who may call /mcp (SPEC §8 "MCP connector") and the OAuth 2.1 endpoints Claude's connector discovers.
// Two ways in, both acting as actor 'mcp':
//   1. Static bearer: `Authorization: Bearer <MCP_BEARER_TOKEN>` (Claude Code; Claude when Request headers exist),
//      compared in constant time.
//   2. OAuth 2.1 (@cloudflare/workers-oauth-provider, KV OAUTH_KV): RFC 8414 metadata, Dynamic Client Registration
//      (/register), Client ID Metadata Documents, /token (+ revocation), and /authorize — a one-button consent page
//      behind Cloudflare Access (app.ts runs the Access check first) that grants the single owner.
// /mcp answers 401 with `WWW-Authenticate: Bearer resource_metadata=…` (RFC 9728) and publishes that metadata at
// /.well-known/oauth-protected-resource/mcp (and the bare path as an alias for clients that probe it).
// Issuer and resource are the request's own origin, so workers.dev, a custom domain and wrangler dev all work.
import {
  AuthorizationError,
  CimdFetchError,
  OAuthAuthorizationServer,
  OAuthResourceServer,
  type OAuthResourceContext,
  type OAuthResourceTokenValidation,
} from '@cloudflare/workers-oauth-provider'
import type { Context } from 'hono'
import type { App, AppEnv, Env } from '../env'
import { depsFromContext, type Deps } from '../lib/deps'
import { HttpError } from '../lib/http-error'
import { constantTimeEqual } from './auth'
import { consentPage, errorPage } from './consent-page'

/** Serves one authenticated MCP request (modules/mcp serveMcp). */
export type McpServe = (request: Request, deps: Deps) => Promise<Response>

/** The one user this single-user app grants. Not a name: it ends up inside issued tokens. */
const OWNER = 'owner'
/** One scope: full access within the rails. Advertised so clients ask for it; the consent page grants it. */
const SCOPE = 'fitness'
const DAY = 86_400

/** What a validated token carries into the MCP handler (ctx.props). */
interface McpProps {
  via: 'bearer' | 'oauth'
}

/** The execution context handed to the resource server: ours, per request, carrying the MCP call to make. */
type McpContext = ExecutionContext & { serve: (request: Request) => Promise<Response> }

interface OAuthServers {
  authorization: OAuthAuthorizationServer<Env>
  resource: OAuthResourceServer<Env, McpProps>
}

/** Per isolate, per origin (construction validates URLs; in practice one or two origins ever arrive). */
const byOrigin = new Map<string, OAuthServers>()

function serversFor(url: string): OAuthServers {
  const origin = new URL(url).origin
  let servers = byOrigin.get(origin)
  if (!servers) {
    try {
      servers = build(origin)
    } catch (err) {
      // workers-oauth-provider accepts http only on loopback hosts (wrangler dev); anything else must be https.
      throw new HttpError(400, 'https_required', `MCP and its OAuth endpoints need HTTPS (${String(err)})`)
    }
    if (byOrigin.size >= 8) byOrigin.clear()
    byOrigin.set(origin, servers)
  }
  return servers
}

function build(origin: string): OAuthServers {
  const resource = `${origin}/mcp`
  const authorization = new OAuthAuthorizationServer<Env>({
    issuer: origin,
    resources: [resource],
    authorizeEndpoint: '/authorize',
    tokenEndpoint: '/token',
    clientRegistrationEndpoint: '/register',
    clientIdMetadataDocumentEnabled: true,
    scopesSupported: [SCOPE],
    accessTokenTTL: 3600,
    // The grant lives while Claude keeps refreshing it; 60 idle days and it lapses (re-approve once).
    refreshTokenTTL: 60 * DAY,
    refreshTokenIdleTTL: 60 * DAY,
  })
  const resourceServer = new OAuthResourceServer<Env, McpProps>({
    resourceMetadata: { resource, authorization_servers: [origin], resource_name: 'Fitness tracker' },
    requiredScopes: [SCOPE],
    validateToken: (env) => async (forResource, token) => {
      if (env.MCP_BEARER_TOKEN && (await constantTimeEqual(token, env.MCP_BEARER_TOKEN))) {
        return { props: { via: 'bearer' }, audience: forResource, scope: [SCOPE], userId: OWNER }
      }
      const t = await authorization.validateToken<McpProps>(forResource, token, env)
      if (!t) return null
      const valid: OAuthResourceTokenValidation<McpProps> = {
        props: { via: 'oauth' },
        audience: t.audience,
        expiresAt: t.expiresAt,
        scope: t.scope,
        userId: t.userId,
        clientId: t.clientId,
      }
      return valid
    },
    handler: { fetch: (request, _env, ctx: OAuthResourceContext<McpProps>) => (ctx as unknown as McpContext).serve(request) },
  })
  return { authorization, resource: resourceServer }
}

/** A fresh execution context per request (the provider writes props/auth onto it); waitUntil goes through deps. */
function contextFor(deps: Deps, serve?: (request: Request) => Promise<Response>): McpContext {
  const ctx = {
    waitUntil: (p: Promise<unknown>) => deps.waitUntil(p),
    passThroughOnException: () => undefined,
    props: {},
    serve: serve ?? (() => Promise.resolve(new Response(null, { status: 404 }))),
  }
  return ctx as unknown as McpContext
}

const mcpDeps = (c: Context<AppEnv>): Deps => depsFromContext(c, 'mcp')

/**
 * Mount /mcp and the OAuth endpoints. /authorize must already be behind the Access check (app.use('/authorize', auth())),
 * and /mcp, /token, /register and /.well-known/* must stay outside Cloudflare Access (docs/DEPLOY.md §6).
 */
export function mountMcp(app: App, serve: McpServe): void {
  // Authorization server: RFC 8414 metadata, DCR, token exchange / refresh / revocation.
  for (const path of ['/.well-known/oauth-authorization-server', '/token', '/register']) {
    app.all(path, (c) => serversFor(c.req.url).authorization.fetch(c.req.raw, c.env, contextFor(mcpDeps(c))))
  }

  // Protected resource metadata (RFC 9728), path-aware; the bare path is an alias for clients that probe it.
  app.all('/.well-known/oauth-protected-resource/mcp', (c) =>
    serversFor(c.req.url).resource.fetch(c.req.raw, c.env, contextFor(mcpDeps(c))),
  )
  app.all('/.well-known/oauth-protected-resource', (c) => {
    const url = new URL(c.req.url)
    url.pathname = '/.well-known/oauth-protected-resource/mcp'
    return serversFor(c.req.url).resource.fetch(new Request(url, c.req.raw), c.env, contextFor(mcpDeps(c)))
  })

  // The MCP endpoint: the resource server checks the token (401 + challenge without one), then serves the request.
  app.all('/mcp', (c) => {
    const deps = mcpDeps(c)
    return serversFor(c.req.url).resource.fetch(c.req.raw, c.env, contextFor(deps, (request) => serve(request, deps)))
  })

  // Consent (Cloudflare Access already verified Aaron). GET shows the page; POST approves or denies.
  app.get('/authorize', (c) =>
    consentStep(async () => {
      const oauth = serversFor(c.req.url).authorization.getOAuthApi(c.env)
      const request = await oauth.parseAuthRequest(c.req.raw)
      const details = await oauth.describeConsent(request) // first: a failed lookup leaves nothing in KV
      const consent = await oauth.beginConsent(request)
      consent.headers.set('Content-Type', 'text/html; charset=utf-8')
      return new Response(consentPage(details, consent.handle), { headers: consent.headers })
    }),
  )
  app.post('/authorize', (c) =>
    consentStep(async () => {
      const oauth = serversFor(c.req.url).authorization.getOAuthApi(c.env)
      const form = await c.req.raw.clone().formData()
      const handle = String(form.get('handle') ?? '')
      if (form.get('decision') !== 'approve') {
        const denied = await oauth.denyConsent(c.req.raw, handle)
        return new Response(null, { status: 302, headers: denied.headers })
      }
      const approved = await oauth.approveConsent(c.req.raw, handle, { scope: [SCOPE] })
      const { redirectTo } = await oauth.completeAuthorization({
        request: approved.request, // from storage, not from the form
        userId: OWNER,
        metadata: {},
        scope: [SCOPE],
        props: { via: 'oauth' } satisfies McpProps,
      })
      approved.headers.set('Location', redirectTo)
      return new Response(null, { status: 302, headers: approved.headers })
    }),
  )
}

/** Expected consent failures: redirect to the client only when the library validated where to; else render locally. */
async function consentStep(step: () => Promise<Response>): Promise<Response> {
  try {
    return await step()
  } catch (err) {
    if (err instanceof AuthorizationError && err.redirectTo) return Response.redirect(err.redirectTo, 302)
    if (err instanceof AuthorizationError) return errorPage(err.description)
    if (err instanceof CimdFetchError) return errorPage('This app could not be verified (its client metadata could not be fetched).')
    throw err
  }
}
