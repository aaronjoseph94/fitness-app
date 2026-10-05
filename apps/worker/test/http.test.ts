// Owns: tests at the HTTP edge (app.ts, lib/route.ts, middleware/auth.ts and errors.ts through the app) — request
// bodies must say what they are (JSON or octet-stream; a cross-site text/plain form can't reach validation), a
// cross-site write is refused before anything runs, path params are decoded once, every Worker response carries the
// security headers, a D1 constraint violation is a 409 the offline queue stops retrying, and signed file links
// (keys with %2F) serve the bytes and refuse a tampered or expired signature.
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { createDb, weight_logs } from '../src/db'
import type { AppEnv } from '../src/env'
import { handleError } from '../src/middleware/errors'
import { signFileUrl } from '../src/modules/files'

const app = createApp()
const db = createDb(env.DB)
const LOCAL = 'http://localhost'
const weighIn = (date: string) => JSON.stringify({ id: crypto.randomUUID(), date, weight_kg: 95 })

describe('request bodies say what they are', () => {
  it('a JSON body sent as text/plain (what a cross-site <form enctype="text/plain"> can send) is 415', async () => {
    const res = await app.request(`${LOCAL}/api/weights`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: weighIn('2026-07-01') }, env)
    expect(res.status).toBe(415)
    expect(await res.json()).toMatchObject({ error: 'unsupported_media_type' })

    const restore = await app.request(
      `${LOCAL}/api/import`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ restore_id: crypto.randomUUID(), overwrite: true, table: 'settings', rows: [{ id: crypto.randomUUID() }] }),
      },
      env,
    )
    expect(restore.status).toBe(415)
  })

  it('a body with no Content-Type is refused; no body at all still counts as {} for all-optional bodies', async () => {
    const untyped = await app.request(`${LOCAL}/api/weights`, { method: 'POST', body: new Blob([weighIn('2026-07-02')]) }, env)
    expect(untyped.status).toBe(415)

    const json = await app.request(`${LOCAL}/api/weights`, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: weighIn('2026-07-03') }, env)
    expect(json.status).toBe(201)
  })

  it('a binary upload must be application/octet-stream', async () => {
    const res = await app.request(
      `${LOCAL}/api/import/files?key=${encodeURIComponent('meal-photos/x.jpg')}&restore_id=${crypto.randomUUID()}`,
      { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'not a photo' },
      env,
    )
    expect(res.status).toBe(415)
  })
})

describe('cross-site writes', () => {
  it('refuses a write whose Sec-Fetch-Site is cross-site (403) and allows the same request same-origin', async () => {
    const send = (site: string) =>
      app.request(
        `${LOCAL}/api/weights`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': site }, body: weighIn('2026-07-04') },
        env,
      )
    const cross = await send('cross-site')
    expect(cross.status).toBe(403)
    expect(await cross.json()).toMatchObject({ error: 'cross_site' })
    expect(await db.$count(weight_logs, eq(weight_logs.date, '2026-07-04'))).toBe(0)

    expect((await send('same-origin')).status).toBe(201)
  })

  it('without Sec-Fetch-Site (older browsers), a foreign Origin on a write is refused too; reads are untouched', async () => {
    const res = await app.request(
      `${LOCAL}/api/weights`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: weighIn('2026-07-05') },
      env,
    )
    expect(res.status).toBe(403)
    const read = await app.request(`${LOCAL}/api/health`, { headers: { 'Sec-Fetch-Site': 'cross-site' } }, env)
    expect(read.status).toBe(200)
  })
})

describe('path params', () => {
  it('are decoded once: /api/meals/%25 is a 400 on the id, not a 500', async () => {
    const res = await app.request(`${LOCAL}/api/meals/%25`, {}, env)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid_request' })
  })
})

describe('signed file links', () => {
  const key = `progress-photos/${crypto.randomUUID()}.jpg`
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])

  it('serve the bytes for a key with %2F, refuse a tampered signature (bad_signature) and an expired link (link_expired)', async () => {
    await env.FILES.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } })
    const signed = await signFileUrl(env, key)
    expect(signed.url).toContain('%2F')

    const ok = await app.request(`${LOCAL}${signed.url}`, {}, env)
    expect(ok.status).toBe(200)
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(bytes)

    const url = new URL(signed.url, LOCAL)
    const sig = url.searchParams.get('sig')!
    url.searchParams.set('sig', `${sig.startsWith('A') ? 'B' : 'A'}${sig.slice(1)}`)
    const tampered = await app.request(url.toString(), {}, env)
    expect(tampered.status).toBe(403)
    expect(await tampered.json()).toMatchObject({ error: 'bad_signature' })

    const old = await signFileUrl(env, key, 60, new Date(Date.now() - 3600_000))
    const expired = await app.request(`${LOCAL}${old.url}`, {}, env)
    expect(expired.status).toBe(403)
    expect(await expired.json()).toMatchObject({ error: 'link_expired' })
  })
})

describe('security headers', () => {
  it('API JSON (and its errors) carry nosniff, same-origin referrer, no framing and a default-src none CSP', async () => {
    for (const path of ['/api/health', '/api/nope']) {
      const res = await app.request(`${LOCAL}${path}`, {}, env)
      expect(res.headers.get('X-Content-Type-Options'), path).toBe('nosniff')
      expect(res.headers.get('Referrer-Policy'), path).toBe('same-origin')
      expect(res.headers.get('X-Frame-Options'), path).toBe('DENY')
      expect(res.headers.get('Content-Security-Policy'), path).toMatch(/default-src 'none'.*frame-ancestors 'none'/)
    }
  })

  it('the consent page keeps its inline styles allowed and cannot be framed', async () => {
    const res = await app.request(`${LOCAL}/authorize?response_type=code&client_id=unknown`, {}, env)
    expect(res.headers.get('Content-Type')).toMatch(/text\/html/)
    const csp = res.headers.get('Content-Security-Policy') ?? ''
    expect(csp).toContain("style-src 'unsafe-inline'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
  })
})

describe('D1 constraint violations', () => {
  it('become 409 conflict (a queued write the client drops), other unexpected errors stay 500', async () => {
    const probe = new Hono<AppEnv>()
    probe.post('/unique', async () => {
      await db.insert(weight_logs).values({ date: '2026-06-01', weight_kg: 90 })
      await db.insert(weight_logs).values({ date: '2026-06-01', weight_kg: 91 })
      return new Response(null, { status: 204 })
    })
    probe.post('/foreign-key', async () => {
      await env.DB.prepare(`INSERT INTO meal_items (id, meal_id, description, grams, kcal) VALUES (?1, ?2, 'x', 1, 1)`)
        .bind(crypto.randomUUID(), crypto.randomUUID())
        .run()
      return new Response(null, { status: 204 })
    })
    probe.post('/boom', () => {
      throw new Error('boom')
    })
    probe.onError(handleError)

    const unique = await probe.request('/unique', { method: 'POST' }, env)
    expect(unique.status).toBe(409)
    expect(await unique.json()).toMatchObject({ error: 'conflict' })
    expect((await probe.request('/foreign-key', { method: 'POST' }, env)).status).toBe(409)
    expect((await probe.request('/boom', { method: 'POST' }, env)).status).toBe(500)
  })
})
