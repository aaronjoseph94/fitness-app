// Owns: the auth seam (middleware/auth.ts through the app) — Access is required on /api unless DEV_AUTH_BYPASS is on
// AND the host is local; the iOS Shortcut webhook needs its bearer token and is idempotent by date.
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app'

const app = createApp()
const noBypass = { ...env, DEV_AUTH_BYPASS: undefined }

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
