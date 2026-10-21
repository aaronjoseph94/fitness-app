// Owns: the HTML of the MCP OAuth consent page (/authorize) and its local error page. One primary action: allow the
// connecting app to read and change the fitness data within the rails ('full', Claude), or to read it and log entries
// ('log', Meta Muse: middleware/mcp-auth.ts knows it by its callback, never by its self-reported name). Everything
// that came from the client (name, domain, redirect host, scopes) is escaped. The Worker serves this page itself (no
// SPA, no /api round trip), so the colours, radii, shadows and the brand mark below are literal 1d Summit values
// (docs/design/design_handoff_fitness_1d/README.md §2, the tokens apps/web/src/theme.ts carries, and the Summit nav's
// logo mark): an inner-page sky band over the cream page, a white card with the card shadow, a deep-sky brand tile,
// ink and body text. Two deliberate departures for contrast: Allow runs #9A3A8E → #6A33D6 instead of the coral CTA
// (white on its #FF7569 end is 2.6:1; this one is ≥ 6.2:1) and the warning text is #A65A00 (5.1:1 on white; #C26A00 is
// 3.9:1). The CSP allows no web fonts, so a system stack stands in for Outfit and DM Sans.
import type { ConsentDescription } from '@cloudflare/workers-oauth-provider'
import type { McpAccess } from '../modules/mcp'

const escape = (value: string) => value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

const STYLE = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; position: relative; color: #1F1033;
  background: linear-gradient(180deg, #1A0A42 0%, #3E1A73 38%, #9A3A8E 74%, #FF7569 100%) top / 100% 160px no-repeat, #FFF8EE;
  font: 400 16px/1.5 'DM Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; }
body::before { content: ''; position: absolute; z-index: -1; top: 116px; right: 0; bottom: 0; left: 0;
  background: #FFF8EE; border-radius: 44px 44px 0 0; box-shadow: 0 -20px 50px rgba(43,15,79,.18); }
main { width: 100%; max-width: 440px; padding: 64px 16px 32px; }
.card { background: #FFFFFF; border-radius: 30px; box-shadow: 0 18px 50px rgba(74,28,120,.10); padding: 28px 24px; }
h1 { font-family: Outfit, 'DM Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 24px;
  font-weight: 500; line-height: 1.25; letter-spacing: -.01em; color: #1F1033; margin: 0 0 12px; }
p { margin: 0 0 12px; color: #4E4063; }
p:last-child { margin-bottom: 0; }
p strong { color: #1F1033; font-weight: 600; }
ul { margin: 0 0 20px; padding-left: 20px; color: #4E4063; }
li { margin-bottom: 6px; }
li::marker { color: #7A6B8E; }
.warn { color: #A65A00; font-weight: 500; }
button { width: 100%; min-height: 50px; border-radius: 16px; font-family: inherit; font-size: 16px; font-weight: 500; cursor: pointer; }
button:focus-visible { outline: 3px solid #7B3FE4; outline-offset: 2px; }
.allow { background: linear-gradient(135deg, #9A3A8E, #6A33D6); color: #FFFFFF; border: 0; margin-top: 8px;
  box-shadow: 0 10px 26px rgba(106,51,214,.30); }
.deny { background: #F3ECFA; color: #1F1033; border: 0; margin-top: 10px; }
.deny:hover { background: #EEE6FF; }
.mark { width: 46px; height: 46px; border-radius: 15px; background: linear-gradient(170deg, #2B0F4F, #1A0A33);
  display: grid; place-items: center; margin-bottom: 18px; }`

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

/**
 * What the page asks for each access level: <title>, heading and the list of what the app may do. The app is named by
 * where access goes (mcp-auth.ts allows only Claude's, Meta Muse's and loopback callbacks), never by the name the
 * client gives itself, which anyone can set.
 */
function grantText(access: McpAccess, loopback: boolean) {
  const name = loopback ? 'an app on this computer' : 'Claude'
  if (access === 'full') {
    return {
      title: `Allow ${name}?`,
      heading: `Allow ${name} to read and change your fitness data within the rails`,
      items: `<li>Read everything you log: weight, meals, water, fasts, sleep, steps, training, scans and reviews.</li>
    <li>Log entries and change plans, targets, templates and week plans. Every change is versioned and revertible.</li>
    <li>Never the rails: calorie floor and ceiling, protein and fat minimums, the fasting pattern, allowed exercises.</li>
    <li>Never your progress photos.</li>`,
    }
  }
  return {
    title: 'Allow Meta Muse?',
    heading:
      'Allow Meta Muse to read your fitness data and log meals, weight, water, steps, sleep, fasts and sets?',
    items: `<li>Read everything you log: weight, meals, water, fasts, sleep, steps, training, scans and reviews. What it reads goes to Meta.</li>
    <li>Log meals, weight, measurements, water, steps, sleep, fasts and workout sets, with the same checks as the app.</li>
    <li>A fast it starts makes that day a fast day, within your two-a-month fasting rail.</li>
    <li>Never plans, other targets, templates, week plans or training days, and never accepting AI drafts: those stay in the app.</li>
    <li>Never your progress photos.</li>`,
  }
}

/** The consent page for one authorization request; the form posts `handle` back to /authorize. */
export function consentPage(details: ConsentDescription, handle: string, access: McpAccess): string {
  const { title, heading, items } = grantText(access, details.redirectIsLoopback)
  const calls = `It calls itself <strong>${escape(details.clientName)}</strong>`
  const who = details.clientDomain
    ? `Published by <strong>${escape(details.clientDomain)}</strong>. ${calls}.`
    : `${calls}; that name is not verified.`
  // Every Claude (or Muse) account shares one callback, so a link someone else started would look the same here.
  const caution = details.redirectIsLoopback
    ? '<p class="warn">Access goes to an app on this computer. Continue only if you just started connecting from it.</p>'
    : '<p>Only allow this if you just pressed Connect yourself.</p>'
  return page(
    title,
    `<div class="card">
  <div class="mark" aria-hidden="true"><svg viewBox="0 0 512 512" width="26" height="26"><polyline points="90,356 190,256 264,312 338,238" fill="none" stroke="#FFFFFF" stroke-width="52" stroke-linecap="round" stroke-linejoin="round"/><circle cx="398" cy="178" r="44" fill="#FFD27A"/></svg></div>
  <h1>${heading}</h1>
  <p>${who} Access is sent to <strong>${escape(details.redirectHost)}</strong>.</p>
  ${caution}
  <ul>
    ${items}
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
  return new Response(body, {
    status: 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Frame-Options': 'DENY' },
  })
}
