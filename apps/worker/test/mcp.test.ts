// Owns: tests at the MCP seam (/mcp through the app: middleware/mcp-auth.ts + modules/mcp) — the 401 challenge with
// RFC 9728 resource metadata, the static bearer (initialize, tools/list with annotations, tools/call get_today with
// structured content, a tool error), prompts and resources, and the OAuth 2.1 path end to end (DCR → consent →
// code + PKCE → token → /mcp).
import { ReminderKind, type ReminderPrefs } from '@fitness/shared/schemas'
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
