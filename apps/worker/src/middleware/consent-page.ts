// Owns: the HTML of the MCP OAuth consent page (/authorize) and its local error page. One primary action: allow the
// connecting app (Claude) to read and change the fitness data within the rails. Everything that came from the client
// (name, domain, redirect host, scopes) is escaped. The Worker serves this page itself (no SPA, no /api round trip), so
// the colours below are literal copies of apps/web/src/theme.ts tokens (ink, page, card, border, weight indigo, flag).
import type { ConsentDescription } from '@cloudflare/workers-oauth-provider'

const escape = (value: string) => value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

const STYLE = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: #FAFAFC; color: #1A1A2E;
  font: 400 16px/1.5 'Outfit', system-ui, -apple-system, 'Segoe UI', sans-serif; display: flex; justify-content: center; }
main { width: 100%; max-width: 440px; padding: 32px 16px; }
.card { background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 16px; padding: 24px 20px; }
h1 { font-size: 22px; font-weight: 600; line-height: 1.3; margin: 0 0 12px; }
p { margin: 0 0 12px; color: #6B7280; }
p strong { color: #1A1A2E; font-weight: 500; }
ul { margin: 0 0 16px; padding-left: 20px; color: #6B7280; }
li { margin-bottom: 4px; }
.warn { color: #DC2626; }
button { width: 100%; min-height: 48px; border-radius: 12px; font-family: inherit; font-size: 16px; font-weight: 500; cursor: pointer; }
.allow { background: #166FE5; color: #FFFFFF; border: 0; margin-top: 8px; }
.deny { background: transparent; color: #6B7280; border: 0; margin-top: 4px; }
.mark { width: 40px; height: 40px; border-radius: 12px; background: rgba(22, 111, 229, 0.12); color: #166FE5;
  display: grid; place-items: center; font-weight: 700; margin-bottom: 16px; }`

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>${STYLE}</style>
</head>
<body><main>${body}</main></body>
</html>`
}

/** The consent page for one authorization request; the form posts `handle` back to /authorize. */
export function consentPage(details: ConsentDescription, handle: string): string {
  const name = escape(details.clientName)
  const who = details.clientDomain
    ? `Published by <strong>${escape(details.clientDomain)}</strong>.`
    : 'This app registered itself; its name is not verified.'
  const loopback = details.redirectIsLoopback
    ? '<p class="warn">Access goes to an app on this computer. Continue only if you just started connecting from it.</p>'
    : ''
  return page(
    `Allow ${name}?`,
    `<div class="card">
  <div class="mark" aria-hidden="true">F</div>
  <h1>Allow ${name} to read and change your fitness data within the rails</h1>
  <p>${who} Access is sent to <strong>${escape(details.redirectHost)}</strong>.</p>
  ${loopback}
  <ul>
    <li>Read everything you log: weight, meals, water, fasts, sleep, steps, training, scans and reviews.</li>
    <li>Log entries and change plans, targets, templates and week plans. Every change is versioned and revertible.</li>
    <li>Never the rails: calorie floor and ceiling, protein and fat minimums, the fasting pattern, allowed exercises.</li>
    <li>Never your progress photos.</li>
  </ul>
  <form method="post">
    <input type="hidden" name="handle" value="${escape(handle)}">
    <button class="allow" type="submit" name="decision" value="approve">Allow</button>
    <button class="deny" type="submit" name="decision" value="deny">Don't allow</button>
  </form>
</div>`,
  )
}

/** A local error page: used whenever redirecting back to the client would not be safe. */
export function errorPage(message: string): Response {
  const body = page(
    'Connection not allowed',
    `<div class="card"><h1>This connection can't continue</h1><p>${escape(message)}</p><p>Start connecting again from the app.</p></div>`,
  )
  return new Response(body, { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY' } })
}
