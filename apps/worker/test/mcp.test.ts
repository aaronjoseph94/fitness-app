// Owns: tests at the MCP seam (/mcp through the app: middleware/mcp-auth.ts + modules/mcp) — the 401 challenge with
// RFC 9728 resource metadata, the static bearer (initialize, tools/list with annotations, tools/call get_today with
// structured content, a tool error), writes over the transport (apply_review makes a plan version the app serves; a
// week plan under the calorie floor is refused), prompts and resources, Dynamic Client Registration only for Claude's
// callbacks and loopback (anything else writes nothing to KV), consent errors (a refused /authorize redirects back to
// the client with the OAuth error; a cross-site POST is 403), and the OAuth 2.1 path end to end (DCR → consent →
// code + PKCE → token → /mcp).
import { addDays, today, weekStart } from '@fitness/shared/engine'
import { ReminderKind, Weekday, type ReminderPrefs } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { createDb, plan_versions, profile, settings, weight_logs } from '../src/db'

const app = createApp()
const db = createDb(env.DB)
const HOST = 'https://fitness.example.workers.dev'
const noBypass = { ...env, DEV_AUTH_BYPASS: undefined }

interface RpcResponse<T = Record<string, unknown>> {
  jsonrpc: '2.0'
  id: number
  result?: T
  error?: { code: number; message: string }
}

let nextId = 1
/** One JSON-RPC request over Streamable HTTP; the stateless server answers with one SSE `message` event (or JSON). */
async function rpc<T = Record<string, unknown>>(method: string, params: unknown, token: string, origin = HOST) {
  const res = await app.request(
    `${origin}/mcp`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2025-06-18',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
    },
    noBypass,
  )
  expect(res.status, await res.clone().text()).toBe(200)
  const text = await res.text()
  const json = res.headers.get('content-type')?.includes('text/event-stream')
    ? text.split('\n').find((l) => l.startsWith('data: '))!.slice('data: '.length)
    : text
  return JSON.parse(json) as RpcResponse<T>
}

const initialize = (token: string, origin?: string) =>
  rpc<{ serverInfo: { name: string }; instructions: string; capabilities: Record<string, unknown> }>(
    'initialize',
    { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'vitest', version: '1' } },
    token,
    origin,
  )

interface ListedTool {
  name: string
  inputSchema: { type: string }
  annotations: { readOnlyHint: boolean; destructiveHint: boolean }
}

beforeAll(async () => {
  await db.batch([
    db.insert(profile).values({
      height_cm: 165.1,
      sex: 'male',
      goal_weight_kg: 65,
      goal_date: '2027-08-04',
      start_weight_kg: 95.1,
      start_date: '2026-09-26',
    }),
    db.insert(settings).values({
      calorie_floor: 1400,
      calorie_ceiling: 1700,
      protein_min_g: 130,
      fat_min_g: 45,
      fibre_target_g: 30,
      water_target_ml: 3000,
      training_days: ['mon', 'tue', 'wed', 'thu'],
      reminders: Object.fromEntries(ReminderKind.options.map((k) => [k, { enabled: true, time: null }])) as ReminderPrefs,
    }),
    db.insert(plan_versions).values({
      version: 1,
      active: true,
      created_by: 'user',
      reason: 'Baseline rails from doctor and dietitian',
      diff: [],
      targets: {
        defaults: { kcal: 1400, protein_g: 130, carbs_g: 118.75, fat_g: 45, fibre_g: 30, water_ml: 3000, steps: 8000 },
        overrides: {},
      },
      forecast: { finish_date: '2027-06-17', weekly_rate_kg: 1.046, band: { low: 0.837, high: 1.256 }, tdee_est: 2551 },
    }),
    db.insert(weight_logs).values({ date: '2026-09-26', weight_kg: 95.1 }),
  ])
})

describe('MCP auth', () => {
  it('answers an unauthenticated /mcp with 401 and a challenge naming the protected resource metadata', async () => {
    const res = await app.request(`${HOST}/mcp`, { method: 'POST', body: '{}' }, noBypass)
    expect(res.status).toBe(401)
    const challenge = res.headers.get('WWW-Authenticate') ?? ''
    expect(challenge).toContain(`resource_metadata="${HOST}/.well-known/oauth-protected-resource/mcp"`)

    const wrong = await app.request(`${HOST}/mcp`, { method: 'POST', headers: { Authorization: 'Bearer nope' }, body: '{}' }, noBypass)
    expect(wrong.status).toBe(401)
    expect(wrong.headers.get('WWW-Authenticate')).toContain('error="invalid_token"')

    const prm = await app.request(`${HOST}/.well-known/oauth-protected-resource/mcp`, {}, noBypass)
    expect(await prm.json()).toMatchObject({ resource: `${HOST}/mcp`, authorization_servers: [HOST] })
    const asm = await app.request(`${HOST}/.well-known/oauth-authorization-server`, {}, noBypass)
    expect(await asm.json()).toMatchObject({
      issuer: HOST,
      authorization_endpoint: `${HOST}/authorize`,
      token_endpoint: `${HOST}/token`,
      registration_endpoint: `${HOST}/register`,
    })
  })

  it('keeps /authorize behind Cloudflare Access', async () => {
    const res = await app.request(`${HOST}/authorize?response_type=code&client_id=x`, {}, noBypass)
    expect(res.status).toBe(401)
  })
})

describe('MCP over the static bearer', () => {
  const token = env.MCP_BEARER_TOKEN!

  it('initializes and lists every tool with both annotations, the procedures as prompts, and the resources', async () => {
    const init = await initialize(token)
    expect(init.result?.serverInfo.name).toBe('fitness')
    expect(init.result?.instructions).toContain('get_procedure')

    const { result } = await rpc<{ tools: ListedTool[] }>('tools/list', {}, token)
    const tools = new Map(result!.tools.map((t) => [t.name, t]))
    for (const name of ['get_today', 'get_review_bundle', 'apply_review', 'propose_week_plan', 'apply_week_plan', 'get_procedure'])
      expect(tools.has(name), name).toBe(true)
    for (const t of result!.tools) {
      expect(t.inputSchema.type, t.name).toBe('object')
      expect(typeof t.annotations.readOnlyHint, t.name).toBe('boolean')
      expect(typeof t.annotations.destructiveHint, t.name).toBe('boolean')
    }
    expect(tools.get('get_today')!.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false })
    expect(tools.get('apply_review')!.annotations).toMatchObject({ readOnlyHint: false })

    const prompts = await rpc<{ prompts: { name: string }[] }>('prompts/list', {}, token)
    expect(prompts.result!.prompts.map((p) => p.name).sort()).toEqual(['coach_review', 'plateau_check', 'program_design', 'scan_debrief'])
    const review = await rpc<{ messages: { content: { text: string } }[] }>('prompts/get', { name: 'coach_review' }, token)
    expect(review.result!.messages[0]!.content.text).toContain('propose_week_plan')

    const templates = await rpc<{ resourceTemplates: { uriTemplate: string }[] }>('resources/templates/list', {}, token)
    expect(templates.result!.resourceTemplates.map((t) => t.uriTemplate)).toEqual(['fitness://week/{week}'])
    const plan = await rpc<{ contents: { text: string }[] }>('resources/read', { uri: 'fitness://plan' }, token)
    expect(JSON.parse(plan.result!.contents[0]!.text)).toMatchObject({ rails: { calorie_floor: 1400 } })
  })

  it("never shows the model the user's name: instructions, tool descriptions and schemas, prompts, procedures, results", async () => {
    const name = /aaron/i
    const init = await initialize(token)
    expect(init.result?.instructions).not.toMatch(name)
    const { result } = await rpc<{ tools: ListedTool[] }>('tools/list', {}, token)
    expect(JSON.stringify(result)).not.toMatch(name)
    const prompts = await rpc<{ prompts: unknown[] }>('prompts/list', {}, token)
    expect(JSON.stringify(prompts.result)).not.toMatch(name)
    for (const procedure of ['coach_review', 'scan_debrief', 'program_design', 'plateau_check']) {
      const prompt = await rpc('prompts/get', { name: procedure }, token)
      expect(JSON.stringify(prompt.result), procedure).not.toMatch(name)
      const text = await rpc('tools/call', { name: 'get_procedure', arguments: { name: procedure } }, token)
      expect(JSON.stringify(text.result), procedure).not.toMatch(name)
    }
    // Text Aaron typed himself reaches the coach without his name too.
    await rpc('tools/call', { name: 'set_dashboard_note', arguments: { text: "Aaron's week: protein first" } }, token)
    const today = await rpc('tools/call', { name: 'get_today', arguments: {} }, token)
    expect(JSON.stringify(today.result)).toContain("the user's week: protein first")
  })

  it('tools/call get_today returns the day as structured content and JSON text; bad input is a tool error', async () => {
    const { result } = await rpc<{ structuredContent: { date: string; targets: { kcal: number } }; content: { text: string }[] }>(
      'tools/call',
      { name: 'get_today', arguments: { date: '2026-09-26' } },
      token,
    )
    expect(result!.structuredContent).toMatchObject({ date: '2026-09-26', targets: { kcal: 1400 } })
    expect(JSON.parse(result!.content[0]!.text)).toMatchObject({ date: '2026-09-26' })

    const bad = await rpc<{ isError: boolean; content: { text: string }[] }>(
      'tools/call',
      { name: 'get_today', arguments: { date: 'yesterday' } },
      token,
    )
    expect(bad.result!.isError).toBe(true)
    expect(bad.result!.content[0]!.text).toMatch(/^invalid_tool_input: /)
  })
})

describe('MCP writes over the transport', () => {
  const token = env.MCP_BEARER_TOKEN!

  it('apply_review with a +100 kcal target change makes a new plan version that GET /api/plan serves', async () => {
    const { result } = await rpc<{ isError?: boolean; structuredContent: { plan_version: { version: number } | null } }>(
      'tools/call',
      {
        name: 'apply_review',
        arguments: {
          summary: 'Raise kcal by 100 for recovery',
          narrative: 'Steady loss of about 1 kg a week; a small raise keeps training quality up.',
          changes: [{ kind: 'target', field: 'kcal', to: 1500, reason: 'Recovery' }],
          record_review: false,
        },
      },
      token,
    )
    expect(result!.isError ?? false, JSON.stringify(result)).toBe(false)
    expect(result!.structuredContent.plan_version).toMatchObject({ version: 2 })

    const plan = await app.request('http://localhost/api/plan', {}, env)
    expect(plan.status).toBe(200)
    expect(await plan.json()).toMatchObject({ version: 2, active: true, created_by: 'mcp', targets: { defaults: { kcal: 1500 } } })
  })

  it('propose_week_plan with a 1,350 kcal day is refused naming calorie_floor, and stores nothing', async () => {
    const monday = weekStart(addDays(today(new Date()), 14))
    const day = (kcal: number) => ({ kcal, protein_g: 130, carbs_g: 150, fat_g: 45, fibre_g: 30 })
    const plan = {
      targets: Object.fromEntries(Weekday.options.map((w) => [w, day(w === 'wed' ? 1350 : 1500)])),
      sessions: Object.fromEntries(Weekday.options.map((w) => [w, null])),
      water_ml: 3000,
      steps: 9000,
      fast_dates: [],
      scan_date: null,
      focus_note: 'Protein first.',
    }
    const { result } = await rpc<{ content: { text: string }[]; structuredContent: { week_plan: unknown; rejected: { rule: string; where: string }[] } }>(
      'tools/call',
      { name: 'propose_week_plan', arguments: { week_start: monday, plan } },
      token,
    )
    expect(result!.structuredContent.week_plan).toBeNull()
    expect(result!.structuredContent.rejected).toEqual(expect.arrayContaining([expect.objectContaining({ where: 'wed.kcal', rule: 'calorie_floor' })]))
    expect(result!.content[0]!.text).toContain('calorie_floor')
  })
})

describe('Dynamic Client Registration', () => {
  const origin = 'http://localhost:8787'
  const register = (redirect_uris: string[]) =>
    app.request(
      `${origin}/register`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_name: 'Some app', redirect_uris, token_endpoint_auth_method: 'none' }),
      },
      env,
    )
  const kvKeys = async () => (await env.OAUTH_KV.list()).keys.length

  it('refuses a client whose callbacks are not Claude’s or loopback, and writes nothing to KV', async () => {
    const before = await kvKeys()
    expect(await (await register(['https://evil.example/cb'])).json()).toMatchObject({ error: 'invalid_redirect_uri' })
    for (const uris of [
      ['https://evil.example/cb'],
      ['https://claude.ai/api/mcp/auth_callback', 'https://evil.example/cb'],
      ['https://claude.ai.evil.example/api/mcp/auth_callback'],
      ['http://claude.ai/api/mcp/auth_callback'],
      ['http://192.168.1.5:3000/callback'],
    ]) {
      const res = await register(uris)
      expect(res.status, uris.join(' ')).toBe(400)
      // Ours (invalid_redirect_uri), or the library's own check for a non-https, non-loopback URI.
      expect(['invalid_redirect_uri', 'invalid_client_metadata']).toContain(((await res.json()) as { error: string }).error)
    }
    expect(await kvKeys()).toBe(before)
  })

  it('registers Claude (claude.ai, claude.com) and Claude Code on a loopback port', async () => {
    for (const uris of [
      ['https://claude.ai/api/mcp/auth_callback'],
      ['https://claude.com/api/mcp/auth_callback'],
      ['http://localhost:53682/callback'],
      ['http://127.0.0.1:33418/'],
    ])
      expect((await register(uris)).status, uris.join(' ')).toBe(201)
  })
})

describe('consent errors', () => {
  it('an /authorize request the library refuses (no PKCE) is sent back to the client as an OAuth error redirect, not a 500', async () => {
    const origin = 'http://localhost:8787'
    const redirect = 'https://claude.ai/api/mcp/auth_callback'
    const reg = await app.request(
      `${origin}/register`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_name: 'Claude', redirect_uris: [redirect], token_endpoint_auth_method: 'none' }),
      },
      env,
    )
    const { client_id } = (await reg.json()) as { client_id: string }
    const query = new URLSearchParams({ response_type: 'code', client_id, redirect_uri: redirect, state: 'abc' })
    const res = await app.request(`${origin}/authorize?${query}`, {}, env)
    expect(res.status).toBe(302)
    const location = new URL(res.headers.get('Location')!)
    expect(`${location.origin}${location.pathname}`).toBe(redirect)
    expect(location.searchParams.get('error')).toBe('invalid_request')
    expect(location.searchParams.get('state')).toBe('abc')
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
  })

  it('a cross-site POST to the consent page is refused before anything is approved', async () => {
    const res = await app.request(
      'http://localhost:8787/authorize',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Sec-Fetch-Site': 'cross-site' },
        body: 'handle=x&decision=approve',
      },
      env,
    )
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'cross_site' })
  })
})

describe('MCP over OAuth 2.1', () => {
  it('registers a client, shows consent, exchanges the code (PKCE) and calls /mcp with the access token', async () => {
    const origin = 'http://localhost:8787' // loopback: http allowed, and DEV_AUTH_BYPASS stands in for Access
    const redirect = 'https://claude.ai/api/mcp/auth_callback'
    const reg = await app.request(
      `${origin}/register`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_name: 'Claude', redirect_uris: [redirect], token_endpoint_auth_method: 'none' }),
      },
      env,
    )
    expect(reg.status).toBe(201)
    const { client_id } = (await reg.json()) as { client_id: string }

    const verifier = 'a'.repeat(20) + crypto.randomUUID()
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
    const challenge = btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const query = new URLSearchParams({
      response_type: 'code',
      client_id,
      redirect_uri: redirect,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'xyz',
      scope: 'fitness',
      resource: `${origin}/mcp`,
    })
    const consent = await app.request(`${origin}/authorize?${query}`, {}, env)
    expect(consent.status).toBe(200)
    const html = await consent.text()
    expect(html).toContain('Allow Claude to read and change your fitness data within the rails')
    const handle = /name="handle" value="([^"]+)"/.exec(html)![1]!
    const cookie = consent.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')

    const approved = await app.request(
      `${origin}/authorize?${query}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
        body: new URLSearchParams({ handle, decision: 'approve' }).toString(),
      },
      env,
    )
    expect(approved.status).toBe(302)
    const location = new URL(approved.headers.get('Location')!)
    expect(`${location.origin}${location.pathname}`).toBe(redirect)
    expect(location.searchParams.get('state')).toBe('xyz')

    const tokenRes = await app.request(
      `${origin}/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: location.searchParams.get('code')!,
          redirect_uri: redirect,
          client_id,
          code_verifier: verifier,
          resource: `${origin}/mcp`,
        }).toString(),
      },
      env,
    )
    expect(tokenRes.status).toBe(200)
    const { access_token } = (await tokenRes.json()) as { access_token: string }

    const init = await initialize(access_token, origin)
    expect(init.result?.serverInfo.name).toBe('fitness')
    const { result } = await rpc<{ tools: ListedTool[] }>('tools/list', {}, access_token, origin)
    expect(result!.tools.some((t) => t.name === 'apply_review')).toBe(true)
  })
})
