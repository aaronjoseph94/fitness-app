// Owns: tests at the MCP seam (/mcp through the app: middleware/mcp-auth.ts + modules/mcp) — the 401 challenge with
// RFC 9728 resource metadata, the static bearer (initialize, tools/list with annotations, tools/call get_today with
// structured content, a tool error), writes over the transport (apply_review makes a plan version the app serves; a
// week plan under the calorie floor is refused), prompts and resources, Dynamic Client Registration only for Claude's
// callbacks, Meta Muse's exact callback and loopback (anything else writes nothing to KV), consent errors (a refused
// /authorize redirects back to the client with the OAuth error; a cross-site POST is 403; a Client ID Metadata Document
// client, which skips registration, is refused at /authorize unless its callbacks are allowed), and the OAuth 2.1 path end
// to end (DCR → consent → code + PKCE → token → /mcp): Claude gets full access, Meta Muse (known by its callback, not
// its name) read + log only, and a grant made before access levels existed keeps full access.
import { OAuthAuthorizationServer } from '@cloudflare/workers-oauth-provider'
import { addDays, today, weekStart } from '@fitness/shared/engine'
import { ReminderKind, Weekday, type ReminderPrefs } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { beforeAll, describe, expect, it, vi } from 'vitest'
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
async function rpc<T = Record<string, unknown>>(
  method: string,
  params: unknown,
  token: string,
  origin = HOST,
) {
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
    ? text
        .split('\n')
        .find((l) => l.startsWith('data: '))!
        .slice('data: '.length)
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
      reminders: Object.fromEntries(
        ReminderKind.options.map((k) => [k, { enabled: true, time: null }]),
      ) as ReminderPrefs,
    }),
    db.insert(plan_versions).values({
      version: 1,
      active: true,
      created_by: 'user',
      reason: 'Baseline rails from doctor and dietitian',
      diff: [],
      targets: {
        defaults: {
          kcal: 1400,
          protein_g: 130,
          carbs_g: 118.75,
          fat_g: 45,
          fibre_g: 30,
          water_ml: 3000,
          steps: 8000,
        },
        overrides: {},
      },
      forecast: {
        finish_date: '2027-06-17',
        weekly_rate_kg: 1.046,
        band: { low: 0.837, high: 1.256 },
        tdee_est: 2551,
      },
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

    const wrong = await app.request(
      `${HOST}/mcp`,
      { method: 'POST', headers: { Authorization: 'Bearer nope' }, body: '{}' },
      noBypass,
    )
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
    for (const name of [
      'get_today',
      'get_review_bundle',
      'apply_review',
      'propose_week_plan',
      'apply_week_plan',
      'get_procedure',
      'propose_plan_change',
    ])
      expect(tools.has(name), name).toBe(true)
    for (const t of result!.tools) {
      expect(t.inputSchema.type, t.name).toBe('object')
      expect(typeof t.annotations.readOnlyHint, t.name).toBe('boolean')
      expect(typeof t.annotations.destructiveHint, t.name).toBe('boolean')
    }
    expect(tools.get('get_today')!.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false })
    expect(tools.get('apply_review')!.annotations).toMatchObject({ readOnlyHint: false })

    const prompts = await rpc<{ prompts: { name: string }[] }>('prompts/list', {}, token)
    expect(prompts.result!.prompts.map((p) => p.name).sort()).toEqual([
      'coach_review',
      'plateau_check',
      'program_design',
      'scan_debrief',
    ])
    const review = await rpc<{ messages: { content: { text: string } }[] }>(
      'prompts/get',
      { name: 'coach_review' },
      token,
    )
    expect(review.result!.messages[0]!.content.text).toContain('propose_week_plan')

    const templates = await rpc<{ resourceTemplates: { uriTemplate: string }[] }>(
      'resources/templates/list',
      {},
      token,
    )
    expect(templates.result!.resourceTemplates.map((t) => t.uriTemplate)).toEqual(['fitness://week/{week}'])
    const plan = await rpc<{ contents: { text: string }[] }>(
      'resources/read',
      { uri: 'fitness://plan' },
      token,
    )
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
    await rpc(
      'tools/call',
      { name: 'set_dashboard_note', arguments: { text: "Aaron's week: protein first" } },
      token,
    )
    const today = await rpc('tools/call', { name: 'get_today', arguments: {} }, token)
    expect(JSON.stringify(today.result)).toContain("the user's week: protein first")
  })

  it('tools/call get_today returns the day as structured content and JSON text; bad input is a tool error', async () => {
    const { result } = await rpc<{
      structuredContent: { date: string; targets: { kcal: number } }
      content: { text: string }[]
    }>('tools/call', { name: 'get_today', arguments: { date: '2026-09-26' } }, token)
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
    const { result } = await rpc<{
      isError?: boolean
      structuredContent: { plan_version: { version: number } | null }
    }>(
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
    expect(await plan.json()).toMatchObject({
      version: 2,
      active: true,
      created_by: 'mcp',
      targets: { defaults: { kcal: 1500 } },
    })
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
    const { result } = await rpc<{
      content: { text: string }[]
      structuredContent: { week_plan: unknown; rejected: { rule: string; where: string }[] }
    }>('tools/call', { name: 'propose_week_plan', arguments: { week_start: monday, plan } }, token)
    expect(result!.structuredContent.week_plan).toBeNull()
    expect(result!.structuredContent.rejected).toEqual(
      expect.arrayContaining([expect.objectContaining({ where: 'wed.kcal', rule: 'calorie_floor' })]),
    )
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
    expect(await (await register(['https://evil.example/cb'])).json()).toMatchObject({
      error: 'invalid_redirect_uri',
    })
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
      expect(['invalid_redirect_uri', 'invalid_client_metadata']).toContain(
        ((await res.json()) as { error: string }).error,
      )
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

  it('registers Meta Muse at its exact callback only, on its own; a sub-path, query, http, look-alike host, muse.ai or a mix with other callbacks is refused', async () => {
    const muse = 'https://agent.meta.ai/api/hatch/oauth/callback'
    expect((await register([muse])).status).toBe(201)

    const before = await kvKeys()
    for (const uris of [
      ['https://agent.meta.ai/api/hatch/oauth/callback/x'],
      ['https://agent.meta.ai/api/hatch/oauth/callback?x=1'],
      ['https://agent.meta.ai.evil.com/api/hatch/oauth/callback'],
      ['https://muse.ai/api/hatch/oauth/callback'],
      [muse, 'https://claude.ai/api/mcp/auth_callback'],
      [muse, 'http://localhost:53682/callback'],
    ]) {
      const res = await register(uris)
      expect(res.status, uris.join(' ')).toBe(400)
      expect(await res.json(), uris.join(' ')).toMatchObject({ error: 'invalid_redirect_uri' })
    }
    // http: the library refuses a non-https, non-loopback URI before our check runs.
    const http = await register(['http://agent.meta.ai/api/hatch/oauth/callback'])
    expect(http.status).toBe(400)
    expect(await http.json()).toMatchObject({ error: 'invalid_client_metadata' })
    expect(await kvKeys()).toBe(before)
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
        body: JSON.stringify({
          client_name: 'Claude',
          redirect_uris: [redirect],
          token_endpoint_auth_method: 'none',
        }),
      },
      env,
    )
    const { client_id } = (await reg.json()) as { client_id: string }
    const query = new URLSearchParams({
      response_type: 'code',
      client_id,
      redirect_uri: redirect,
      state: 'abc',
    })
    const res = await app.request(`${origin}/authorize?${query}`, {}, env)
    expect(res.status).toBe(302)
    const location = new URL(res.headers.get('Location')!)
    expect(`${location.origin}${location.pathname}`).toBe(redirect)
    expect(location.searchParams.get('error')).toBe('invalid_request')
    expect(location.searchParams.get('state')).toBe('abc')
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
  })

  it('a Client ID Metadata Document client (no registration) is refused at /authorize unless its callbacks are allowed, on GET and again on POST, with a local page', async () => {
    const origin = 'http://localhost:8787'
    const clientId = 'https://evil.example/oauth/client.json'
    const claude = 'https://claude.ai/api/mcp/auth_callback'
    let redirectUris = ['https://evil.example/cb']
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url !== clientId) throw new Error(`unexpected fetch ${url}`)
      return Response.json({
        client_id: clientId,
        client_name: 'Claude',
        redirect_uris: redirectUris,
        token_endpoint_auth_method: 'none',
      })
    })
    const authorize = (redirect: string) =>
      `${origin}/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirect,
        code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        code_challenge_method: 'S256',
        state: 'abc',
        scope: 'fitness',
        resource: `${origin}/mcp`,
      })}`
    try {
      const refused = await app.request(authorize('https://evil.example/cb'), {}, env)
      expect(refused.status).toBe(400)
      expect(refused.headers.get('Location')).toBeNull()
      expect(await refused.text()).toContain('This app is not allowed to connect.')
      // A request the library refuses (no PKCE) is not bounced to that client's callback either.
      const noPkce = new URL(authorize('https://evil.example/cb'))
      noPkce.searchParams.delete('code_challenge')
      noPkce.searchParams.delete('code_challenge_method')
      const bounced = await app.request(noPkce.href, {}, env)
      expect(bounced.status).toBe(400)
      expect(bounced.headers.get('Location')).toBeNull()

      // Allowed when the page is shown; the document changes before Allow is pressed.
      redirectUris = [claude]
      const consent = await app.request(authorize(claude), {}, env)
      expect(consent.status).toBe(200)
      const handle = /name="handle" value="([^"]+)"/.exec(await consent.text())![1]!
      const cookie = consent.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; ')
      redirectUris = ['https://evil.example/cb']
      const approved = await app.request(
        authorize(claude),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
          body: new URLSearchParams({ handle, decision: 'approve' }).toString(),
        },
        env,
      )
      expect(approved.status).toBe(400)
      expect(approved.headers.get('Location')).toBeNull()
      expect(await approved.text()).toContain('This app is not allowed to connect.')
    } finally {
      vi.restoreAllMocks()
    }
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
  const origin = 'http://localhost:8787' // loopback: http allowed, and DEV_AUTH_BYPASS stands in for Access
  const CLAUDE = 'https://claude.ai/api/mcp/auth_callback'
  const MUSE = 'https://agent.meta.ai/api/hatch/oauth/callback'

  async function registerClient(redirect: string, clientName: string): Promise<string> {
    const reg = await app.request(
      `${origin}/register`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: clientName,
          redirect_uris: [redirect],
          token_endpoint_auth_method: 'none',
        }),
      },
      env,
    )
    expect(reg.status).toBe(201)
    return ((await reg.json()) as { client_id: string }).client_id
  }

  async function pkce() {
    const verifier = 'a'.repeat(20) + crypto.randomUUID()
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
    const challenge = btoa(String.fromCharCode(...digest))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    return { verifier, challenge }
  }

  async function exchange(code: string, redirect: string, client_id: string, verifier: string) {
    const tokenRes = await app.request(
      `${origin}/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirect,
          client_id,
          code_verifier: verifier,
          resource: `${origin}/mcp`,
        }).toString(),
      },
      env,
    )
    expect(tokenRes.status).toBe(200)
    return ((await tokenRes.json()) as { access_token: string }).access_token
  }

  /** A connector's sign-in: DCR → consent page → Allow → code + PKCE → access token. */
  async function connect(redirect: string, clientName: string) {
    const client_id = await registerClient(redirect, clientName)
    const { verifier, challenge } = await pkce()
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
    const handle = /name="handle" value="([^"]+)"/.exec(html)![1]!
    const cookie = consent.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')

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

    const access_token = await exchange(location.searchParams.get('code')!, redirect, client_id, verifier)
    return { html, access_token }
  }

  const toolNames = async (token: string) => {
    const { result } = await rpc<{ tools: ListedTool[] }>('tools/list', {}, token, origin)
    return result!.tools.map((t) => t.name)
  }

  it('registers a client, shows consent, exchanges the code (PKCE) and calls /mcp with the access token', async () => {
    const { html, access_token } = await connect(CLAUDE, 'Claude')
    expect(html).toContain('Allow Claude to read and change your fitness data within the rails')
    expect(html).toContain('Only allow this if you just pressed Connect yourself.')

    const init = await initialize(access_token, origin)
    expect(init.result?.serverInfo.name).toBe('fitness')
    expect(await toolNames(access_token)).toEqual(
      expect.arrayContaining(['apply_review', 'propose_plan_change']),
    )
  })

  it('Meta Muse, known by its callback (not its self-reported name), gets read + log only', async () => {
    const { html, access_token } = await connect(MUSE, 'Claude')
    expect(html).toContain(
      'Allow Meta Muse to read your fitness data and log meals, weight, water, steps, sleep, fasts and sets?',
    )
    expect(html).not.toContain('read and change your fitness data')

    const init = await initialize(access_token, origin)
    expect(init.result?.instructions).toContain('log_meal')
    expect(init.result?.instructions).not.toContain('get_procedure')
    expect(init.result?.instructions).not.toMatch(/aaron/i)

    // Pinned: a new write tool marked read-only by mistake would show up here. No propose_plan_change,
    // apply_week_plan, set_training_days, update_template or any other plan, template or revert tool, and no
    // get_procedure (the coach procedures direct plan writes).
    expect((await toolNames(access_token)).sort()).toEqual([
      'compare_scans',
      'confirm_meal',
      'end_fast',
      'finish_session',
      'get_equipment_profile',
      'get_exercise',
      'get_plan',
      'get_review_bundle',
      'get_scan',
      'get_today',
      'get_training_history',
      'get_training_week',
      'get_trend',
      'get_week_plan',
      'get_weekly_review',
      'list_exercises',
      'list_plan_versions',
      'list_reviews',
      'list_scans',
      'list_templates',
      'log_meal',
      'log_measurement',
      'log_set',
      'log_sleep',
      'log_steps',
      'log_water',
      'log_weight',
      'query_metric',
      'search_foods',
      'start_fast',
      'start_session',
    ])

    const refused = await rpc<{ isError?: boolean; content: { text: string }[] }>(
      'tools/call',
      { name: 'propose_plan_change', arguments: { reason: 'More food', changes: [] } },
      access_token,
      origin,
    )
    // Not registered for this access level, so the server refuses it before anything runs.
    expect(refused.result).toBeUndefined()
    expect(refused.error?.message).toBe('Tool propose_plan_change not found')

    // start_session is listed, but starting from an AI draft would accept it: refused before anything runs.
    const draft = await rpc<{ isError?: boolean; content: { text: string }[] }>(
      'tools/call',
      { name: 'start_session', arguments: { proposal_id: '00000000-0000-4000-8000-000000000001' } },
      access_token,
      origin,
    )
    expect(draft.result?.isError).toBe(true)
    expect(draft.result!.content[0]!.text).toMatch(/^not_allowed: Starting from an AI draft accepts it/)

    const meal = await rpc<{ isError?: boolean; structuredContent: { status: string; raw_text: string } }>(
      'tools/call',
      { name: 'log_meal', arguments: { slot: 'breakfast', text: '2 eggs and toast' } },
      access_token,
      origin,
    )
    expect(meal.result!.isError ?? false, JSON.stringify(meal.result)).toBe(false)
    expect(meal.result!.structuredContent).toMatchObject({ status: 'parsing', raw_text: '2 eggs and toast' })

    const plan = await rpc<{ contents: { text: string }[] }>(
      'resources/read',
      { uri: 'fitness://plan' },
      access_token,
      origin,
    )
    expect(JSON.parse(plan.result!.contents[0]!.text)).toMatchObject({ rails: { calorie_floor: 1400 } })
  })

  it('a grant made before access levels existed (props without access) keeps full access', async () => {
    const client_id = await registerClient(CLAUDE, 'Claude')
    const { verifier, challenge } = await pkce()
    // The provider as it was configured before this change, granting { via: 'oauth' } alone.
    const before = new OAuthAuthorizationServer({
      issuer: origin,
      resources: [`${origin}/mcp`],
      authorizeEndpoint: '/authorize',
      tokenEndpoint: '/token',
      clientRegistrationEndpoint: '/register',
      scopesSupported: ['fitness'],
    })
    const { redirectTo } = await before.getOAuthApi(env).completeAuthorization({
      request: {
        responseType: 'code',
        clientId: client_id,
        redirectUri: CLAUDE,
        scope: ['fitness'],
        state: 'old',
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
        resource: `${origin}/mcp`,
        issuer: origin,
      },
      userId: 'owner',
      metadata: {},
      scope: ['fitness'],
      props: { via: 'oauth' },
    })
    const code = new URL(redirectTo).searchParams.get('code')!
    const access_token = await exchange(code, CLAUDE, client_id, verifier)

    expect(await toolNames(access_token)).toEqual(
      expect.arrayContaining([
        'propose_plan_change',
        'apply_week_plan',
        'set_training_days',
        'update_template',
      ]),
    )
    const prompts = await rpc<{ prompts: { name: string }[] }>('prompts/list', {}, access_token, origin)
    expect(prompts.result!.prompts.map((p) => p.name)).toContain('coach_review')
  })
})
