// Owns: the security headers on every response the Worker itself makes (API JSON and errors, signed files, the MCP and
// OAuth endpoints, the consent page): nosniff, a same-origin referrer, no framing, HSTS, and a Content-Security-Policy
// per kind of response. Static assets (the PWA) never pass through here: their headers come from the web build's
// public/_headers, and they are served before the Worker runs.
import type { MiddlewareHandler } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import type { AppEnv } from '../env'

/** Headers every Worker response gets (hono's defaults for the rest: COOP/CORP same-origin, X-XSS-Protection 0, …). */
const COMMON = {
  xFrameOptions: 'DENY',
  referrerPolicy: 'same-origin',
  // No includeSubDomains: a custom domain's parent zone may host other sites.
  strictTransportSecurity: 'max-age=31536000',
} as const

/** JSON, MCP, OAuth: nothing in the response may load or run anything, nor be framed. */
const API_CSP = { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"] }

/**
 * Signed files open in a tab (photos, the weekly report PDF): still no scripts and no framing, but the browser's own
 * image and PDF viewers may render them (a PDF is a plugin document, checked against object-src).
 */
const FILE_CSP = {
  defaultSrc: ["'none'"],
  imgSrc: ["'self'"],
  styleSrc: ["'unsafe-inline'"],
  objectSrc: ["'self'"],
  frameAncestors: ["'none'"],
  baseUri: ["'none'"],
}

/**
 * The consent page (/authorize): inline styles only, no scripts. No form-action: approving redirects to the client's
 * registered callback (claude.ai, or a loopback port for Claude Code), which form-action would also have to list.
 */
const PAGE_CSP = { defaultSrc: ["'none'"], styleSrc: ["'unsafe-inline'"], frameAncestors: ["'none'"], baseUri: ["'none'"] }

const api = secureHeaders({ ...COMMON, contentSecurityPolicy: API_CSP })
const files = secureHeaders({ ...COMMON, contentSecurityPolicy: FILE_CSP })
// No COOP on the consent page: Claude may open it in a popup and expects its callback page to keep the opener.
const page = secureHeaders({ ...COMMON, crossOriginOpenerPolicy: false, contentSecurityPolicy: PAGE_CSP })

/**
 * Paths whose responses the Worker makes. Anything else that reaches it falls through to the static assets, whose
 * responses are immutable here (and carry their own headers).
 */
export const WORKER_PATHS = [
  '/api/*',
  '/mcp',
  '/authorize',
  '/token',
  '/register',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp',
] as const

/** Mount with app.use(path, securityHeaders()) for each of WORKER_PATHS, before auth so its errors get them too. */
export function securityHeaders(): MiddlewareHandler<AppEnv> {
  return (c, next) => {
    const path = c.req.path
    if (path === '/authorize') return page(c, next)
    if (path.startsWith('/api/files/')) return files(c, next)
    return api(c, next)
  }
}
