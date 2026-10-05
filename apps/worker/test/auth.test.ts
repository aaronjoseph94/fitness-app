// Owns: the auth seam (middleware/auth.ts through the app) — Access is required on /api unless DEV_AUTH_BYPASS is on
// AND the host is local; a real Access JWT (RS256, team JWKS) is accepted only for our AUD, only for ACCESS_EMAIL when
// set, and the PDF service token only reads; the iOS Shortcut webhook needs its bearer token and is idempotent by date.
import { env } from 'cloudflare:workers'
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app'

const app = createApp()
const noBypass = { ...env, DEV_AUTH_BYPASS: undefined }

// ── A local Access team: an RS256 key pair, its JWKS served by a stubbed fetch, and tokens signed with it ──────────
const TEAM = 'https://fitness-test.cloudflareaccess.com'
const AUD = 'fitness-app-aud'
const HOST = 'https://fitness.example.workers.dev'
const SERVICE_ID = 'pdf-renderer.access'
const keys = await generateKeyPair('RS256', { extractable: true })
const jwk = { ...(await exportJWK(keys.publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' }
const accessEnv = (extra: Record<string, string> = {}) => ({
  ...noBypass,
  ACCESS_TEAM_DOMAIN: TEAM,
  ACCESS_AUD: AUD,
  ACCESS_CLIENT_ID: SERVICE_ID,
  ...extra,
})

function stubJwks() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url === `${TEAM}/cdn-cgi/access/certs`) return Response.json({ keys: [jwk] })
    throw new Error(`unexpected fetch ${url}`)
  })
}
afterEach(() => vi.restoreAllMocks())

const accessToken = (claims: JWTPayload, aud = AUD) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(TEAM)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(keys.privateKey)

const withAccess = (token: string, init: RequestInit = {}) => ({
  ...init,
  headers: { ...(init.headers as Record<string, string> | undefined), 'Cf-Access-Jwt-Assertion': token },
})
const weighIn = () => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: crypto.randomUUID(), date: '2026-08-01', weight_kg: 95 }),
})

describe('a real Cloudflare Access JWT', () => {
  it('accepts a token for our AUD and rejects one for another application', async () => {
    stubJwks()
    const ok = await app.request(`${HOST}/api/health`, withAccess(await accessToken({ email: 'aaron@example.com' })), accessEnv())
    expect(ok.status).toBe(200)

    const other = await app.request(`${HOST}/api/health`, withAccess(await accessToken({ email: 'aaron@example.com' }, 'another-app')), accessEnv())
    expect(other.status).toBe(401)
  })

  it('with ACCESS_EMAIL set, only that identity (any case) gets in; another Access user is 403', async () => {
    stubJwks()
    const owner = await app.request(
      `${HOST}/api/health`,
      withAccess(await accessToken({ email: 'aaron@example.com' })),
      accessEnv({ ACCESS_EMAIL: 'Aaron@Example.com' }),
    )
    expect(owner.status).toBe(200)

    const stranger = await app.request(
      `${HOST}/api/health`,
      withAccess(await accessToken({ email: 'someone@example.com' })),
      accessEnv({ ACCESS_EMAIL: 'aaron@example.com' }),
    )
    expect(stranger.status).toBe(403)
    expect(await stranger.json()).toMatchObject({ error: 'forbidden' })
  })

  it('the PDF service token may read (GET) but never write', async () => {
    stubJwks()
    const service = await accessToken({ common_name: SERVICE_ID, sub: '' })
    const read = await app.request(`${HOST}/api/health`, withAccess(service), accessEnv({ ACCESS_EMAIL: 'aaron@example.com' }))
    expect(read.status).toBe(200)

    const write = await app.request(`${HOST}/api/weights`, withAccess(service, weighIn()), accessEnv())
    expect(write.status).toBe(403)
    expect(await write.json()).toMatchObject({ error: 'read_only' })
  })
})

describe('Access on /api', () => {
  it('rejects a request without an Access JWT when the dev bypass is off', async () => {
    const res = await app.request('http://localhost/api/health', {}, noBypass)
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'unauthorized' })
  })

  it('rejects a malformed Access JWT', async () => {
    const res = await app.request(
      'https://fitness.example.workers.dev/api/health',
      { headers: { 'Cf-Access-Jwt-Assertion': 'not-a-jwt' } },
      { ...noBypass, ACCESS_TEAM_DOMAIN: 'aaron.cloudflareaccess.com', ACCESS_AUD: 'test-aud' },
    )
    expect(res.status).toBe(401)
  })

  it('honours DEV_AUTH_BYPASS on localhost only', async () => {
    const local = await app.request('http://127.0.0.1:8787/api/health', {}, env)
    expect(local.status).toBe(200)
    expect(await local.json()).toEqual({ ok: true, tz: 'America/Edmonton' })

    const remote = await app.request('https://fitness.example.workers.dev/api/health', {}, env)
    expect(remote.status).toBe(401)
  })
})

describe('POST /api/ingest/health (iOS Shortcut)', () => {
  const body = {
    date: '2026-10-04',
    steps: '8432',
    active_kcal: 411.6,
    sleep: { in_bed_at: '2026-10-04T22:40:00-06:00', woke_at: '2026-10-05T06:10:00-06:00', asleep_min: 412 },
  }
  const send = (token: string) =>
    app.request(
      'https://fitness.example.workers.dev/api/ingest/health',
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      noBypass,
    )

  it('rejects a wrong bearer token', async () => {
    const res = await send('wrong-token')
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'unauthorized' })
  })

  it('stores steps by date and sleep by wake date, and sending the same day twice changes nothing', async () => {
    const first = await send(env.HEALTH_WEBHOOK_TOKEN!)
    expect(first.status).toBe(200)
    const a = (await first.json()) as { steps: { id: string; steps: number; active_kcal: number }; sleep: { id: string; date: string } }
    expect(a.steps).toMatchObject({ steps: 8432, active_kcal: 412, source: 'watch_webhook' })
    expect(a.sleep).toMatchObject({ date: '2026-10-05', asleep_min: 412, woke_at: '2026-10-05T12:10:00.000Z' })

    const second = await send(env.HEALTH_WEBHOOK_TOKEN!)
    expect(second.status).toBe(200)
    const b = (await second.json()) as typeof a
    expect(b.steps.id).toBe(a.steps.id)
    expect(b.sleep.id).toBe(a.sleep.id)
  })
})
