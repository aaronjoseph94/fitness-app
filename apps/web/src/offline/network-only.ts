// Owns: the navigations the service worker must never answer from the cached app shell (they must reach the network).
// A leaf file with no imports, so both the service worker bundle and the page can import it.

/** Query parameter the "Sign in again" link adds so the navigation bypasses the cached shell and meets Cloudflare Access. */
export const SIGN_IN_PARAM = 'signin'

/** Matched against `pathname + search` by Workbox's NavigationRoute denylist. Mirrors wrangler.jsonc `run_worker_first`. */
export const NETWORK_ONLY_NAVIGATIONS: RegExp[] = [
  /^\/api\//,
  /^\/mcp/,
  /^\/reports\/.*\.pdf$/,
  // Cloudflare Access login/logout pages.
  /^\/cdn-cgi\//,
  // MCP OAuth consent flow (Claude opens /authorize in this browser).
  /^\/(authorize|token|register)(\/|\?|$)/,
  /^\/\.well-known\//,
  new RegExp(`[?&]${SIGN_IN_PARAM}=`),
]
