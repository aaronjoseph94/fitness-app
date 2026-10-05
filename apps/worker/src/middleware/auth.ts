// Owns: who may call /api — Cloudflare Access JWT verification (Aaron's login, pinned to ACCESS_EMAIL when set, and the
// PDF renderer's read-only service token), the localhost-only DEV_AUTH_BYPASS, the bearer tokens of paths Access
// excludes (the iOS Shortcut webhook), and refusing cross-site writes (CSRF: Sec-Fetch-Site, else Origin).
// Every request that passes is attributed to actor 'user'. /mcp is not under /api and brings its own auth
// (middleware/mcp-auth.ts); its OAuth consent page (/authorize) is guarded by this same Access check.
import type { MiddlewareHandler } from 'hono'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { AppEnv, Env } from '../env'
import { HttpError } from '../lib/http-error'

/** Paths excluded from the Access policy; each checks `Authorization: Bearer <secret>` instead. */
const BEARER_PATHS: Record<string, (env: Env) => string | undefined> = {
  '/api/ingest/health': (env) => env.HEALTH_WEBHOOK_TOKEN,
}

/** Hosts where DEV_AUTH_BYPASS=1 is honoured (wrangler dev). Any other host always needs a real Access JWT. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

const unauthorized = (message: string) => new HttpError(401, 'unauthorized', message)

/** Methods that never change anything (the only ones the PDF service token and cross-site requests may use). */
const SAFE_METHODS = new Set(['GET', 'HEAD'])

/** Authenticate every /api request; mount with app.use('/api/*', auth()). */
export function auth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const url = new URL(c.req.url)
    const bearerSecret = BEARER_PATHS[c.req.path]
    if (bearerSecret) {
      // A bearer token is never sent by a browser on its own, so these paths need no cross-site check.
      await checkBearer(c.req.header('authorization'), bearerSecret(c.env))
    } else {
      if (!SAFE_METHODS.has(c.req.method)) refuseCrossSite(c.req.header('sec-fetch-site'), c.req.header('origin'), url.origin)
      if (!(c.env.DEV_AUTH_BYPASS === '1' && LOCAL_HOSTS.has(url.hostname))) {
        const identity = await verifyAccess(c.req.header('cf-access-jwt-assertion'), c.env)
        if (identity === 'service' && !SAFE_METHODS.has(c.req.method))
          throw new HttpError(403, 'read_only', 'The service token may only read')
      }
    }
    c.set('actor', 'user')
    await next()
  }
}

// ── Cross-site writes (CSRF) ───────────────────────────────────────────────────────────────────────────────────

/**
 * The Access cookie rides along on any request the browser sends, so a write must come from our own pages. Browsers
 * say where a request came from in Sec-Fetch-Site; only 'same-origin' (the PWA) and 'none' (typed by the user) pass.
 * Browsers too old to send it still send Origin on a POST: it must be ours. Server-to-server callers send neither.
 */
function refuseCrossSite(site: string | undefined, origin: string | undefined, ours: string): void {
  const foreign = site !== undefined ? site !== 'same-origin' && site !== 'none' : origin !== undefined && origin !== ours
  if (foreign) throw new HttpError(403, 'cross_site', 'Changes can only be made from the app itself')
}

// ── Cloudflare Access ──────────────────────────────────────────────────────────────────────────────────────────

/** The team's JWKS, cached per isolate (jose caches the fetched keys and refetches on an unknown kid). */
let jwks: { issuer: string; keys: ReturnType<typeof createRemoteJWKSet> } | null = null

function keysFor(issuer: string) {
  if (jwks?.issuer !== issuer) jwks = { issuer, keys: createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)) }
  return jwks.keys
}

/** "team.cloudflareaccess.com" or "https://team.cloudflareaccess.com/" → "https://team.cloudflareaccess.com". */
const teamOrigin = (domain: string) => (/^https?:\/\//.test(domain) ? domain : `https://${domain}`).replace(/\/+$/, '')

/**
 * Verify `Cf-Access-Jwt-Assertion`: RS256 signature against the team JWKS, iss = team domain, aud ∈ ACCESS_AUD
 * (comma-separated), exp/nbf. Accept a user JWT (has `email`; it must equal ACCESS_EMAIL, case-insensitively, when that
 * is set) or the service token whose common_name is ACCESS_CLIENT_ID. Returns which of the two it was.
 */
async function verifyAccess(token: string | undefined, env: Env): Promise<'user' | 'service'> {
  if (!token) throw unauthorized('Missing Cloudflare Access token')
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    console.error(JSON.stringify({ level: 'error', msg: 'ACCESS_TEAM_DOMAIN / ACCESS_AUD not configured' }))
    throw new HttpError(500, 'auth_not_configured', 'Cloudflare Access is not configured on this Worker')
  }
  const issuer = teamOrigin(env.ACCESS_TEAM_DOMAIN)
  let payload: Record<string, unknown>
  try {
    ;({ payload } = await jwtVerify(token, keysFor(issuer), {
      issuer,
      audience: env.ACCESS_AUD.split(',').map((a) => a.trim()),
      algorithms: ['RS256'],
    }))
  } catch {
    throw unauthorized('Invalid or expired Cloudflare Access token')
  }
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
  const owner = env.ACCESS_EMAIL?.trim().toLowerCase()
  if (email && (!owner || email === owner)) return 'user'
  if (!email && env.ACCESS_CLIENT_ID && payload.common_name === env.ACCESS_CLIENT_ID) return 'service'
  throw new HttpError(403, 'forbidden', 'This Access identity may not use the API')
}

// ── Bearer tokens ──────────────────────────────────────────────────────────────────────────────────────────────

async function checkBearer(header: string | undefined, secret: string | undefined): Promise<void> {
  const token = /^Bearer\s+(\S+)\s*$/i.exec(header ?? '')?.[1]
  if (!secret || !token || !(await constantTimeEqual(token, secret))) throw unauthorized('Missing or invalid bearer token')
}

/** Compare SHA-256(a) with SHA-256(b) in constant time (equal-length digests, so neither length nor content leaks). */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  return crypto.subtle.timingSafeEqual(da, db)
}
