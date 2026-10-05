// Owns: logging round trips through the routes — weigh-ins (idempotent by client id, one per date) feed the trend, and
// nothing is logged for a day that has not happened yet (weigh-ins, tape, water, steps, sleep, the health webhook).
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app'

const app = createApp()
const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.request(
    `http://localhost${path}`,
    body === undefined ? { method, headers } : { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) },
    env,
  )

describe('weigh-ins → trend', () => {
  it('logs weigh-ins (a replay returns the stored row, a second weigh-in replaces the date) and shows them in the trend', async () => {
    const first = { id: crypto.randomUUID(), date: '2026-10-01', weight_kg: 95.1 }
    expect((await call('POST', '/api/weights', first)).status).toBe(201)
    const replay = await call('POST', '/api/weights', { ...first, weight_kg: 99 })
    expect(replay.status).toBe(201)
    expect(await replay.json()).toMatchObject({ id: first.id, weight_kg: 95.1 })

    await call('POST', '/api/weights', { id: crypto.randomUUID(), date: '2026-10-02', weight_kg: 96.0 })
    const second = { id: crypto.randomUUID(), date: '2026-10-02', weight_kg: 94.3 }
    expect(await (await call('POST', '/api/weights', second)).json()).toMatchObject({ id: second.id, weight_kg: 94.3 })

    const res = await call('GET', '/api/trend?from=2026-10-01&to=2026-10-03')
    expect(res.status).toBe(200)
    const trend = (await res.json()) as { points: { date: string; weight_kg: number | null; trend_kg: number }[] }
    // EWMA α = 0.25: 95.1, then 95.1 + 0.25 × (94.3 − 95.1) = 94.9, carried over the gap on 10-03.
    expect(trend.points.map((p) => [p.date, p.weight_kg])).toEqual([
      ['2026-10-01', 95.1],
      ['2026-10-02', 94.3],
      ['2026-10-03', null],
    ])
    expect(trend.points[1]!.trend_kg).toBeCloseTo(94.9, 6)
    expect(trend.points[2]!.trend_kg).toBeCloseTo(94.9, 6)
  })
})

describe('a day that has not happened yet', () => {
  // Far enough ahead to be tomorrow or later whatever the test clock says.
  const FUTURE = '2099-01-01'

  it('refuses a weigh-in or tape dated after today, and moving a weigh-in there', async () => {
    expect((await call('POST', '/api/weights', { id: crypto.randomUUID(), date: FUTURE, weight_kg: 90 })).status).toBe(400)
    const today = { id: crypto.randomUUID(), date: '2026-10-04', weight_kg: 95 }
    expect((await call('POST', '/api/weights', today)).status).toBe(201)
    expect((await call('PUT', `/api/weights/${today.id}`, { date: FUTURE, weight_kg: 95, note: null })).status).toBe(400)
    const tape = { date: FUTURE, entries: [{ id: crypto.randomUUID(), site: 'waist_navel', value_cm: 110 }] }
    expect((await call('POST', '/api/measurements', tape)).status).toBe(400)
  })

  it('refuses water, steps, sleep and a webhook day in the future', async () => {
    expect((await call('POST', '/api/water', { id: crypto.randomUUID(), amount_ml: 250, logged_at: `${FUTURE}T12:00:00.000Z` })).status).toBe(400)
    expect((await call('POST', '/api/steps', { id: crypto.randomUUID(), date: FUTURE, steps: 9000 })).status).toBe(400)
    expect((await call('POST', '/api/sleep', { id: crypto.randomUUID(), date: FUTURE, asleep_min: 420 })).status).toBe(400)
    const bearer = { Authorization: `Bearer ${env.HEALTH_WEBHOOK_TOKEN}` }
    expect((await call('POST', '/api/ingest/health', { date: FUTURE, steps: 9000 }, bearer)).status).toBe(400)
    // Yesterday's data, as the Shortcut sends it each morning, still lands.
    expect((await call('POST', '/api/ingest/health', { date: '2026-10-04', steps: 9000 }, bearer)).status).toBe(200)
    // An export file's rows for days to come are skipped, the rest upsert.
    const page = { rows: [{ date: '2026-10-03', steps: 7000 }, { date: FUTURE, steps: 7000 }] }
    expect(await (await call('POST', '/api/imports/health', page)).json()).toEqual({ steps_upserted: 1, sleep_upserted: 0, skipped: 1 })
  })
})
