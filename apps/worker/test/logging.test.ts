// Owns: one logging round trip through the routes — weigh-ins (idempotent by client id, one per date) feed the trend.
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app'

const app = createApp()
const call = (method: string, path: string, body?: unknown) =>
  app.request(
    `http://localhost${path}`,
    body === undefined ? { method } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
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
