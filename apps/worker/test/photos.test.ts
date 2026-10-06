// Owns: tests at the photos seam — an upload tagged with the day's trend weight and the nearest confirmed scan, served
// back through a short-lived signed URL; metadata-carrying bytes refused (JPEG APP1 Exif or XMP anywhere before the
// image data, however far in; PNG eXIf / text chunks; WebP EXIF / XMP chunks); and the privacy rail, checked by
// behaviour: with every LLM key set, uploading, listing, viewing and removing photos makes no outbound call at all and
// queues no job (a progress photo cannot reach any LLM).
import { PhotoUploadQuery, type ProgressPhoto } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app'
import { ai_jobs, createDb, scans, weight_logs } from '../src/db'
import { serveSignedFile } from '../src/modules/files'
import type { Deps } from '../src/lib/deps'
import { checkPhotoBytes, listPhotos, removePhoto, uploadPhoto } from '../src/modules/photos'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
const deps: Deps = {
  db,
  env,
  now: () => new Date('2001-03-10T18:00:00.000Z'),
  actor: 'user',
  waitUntil: (p) => void pending.push(p.catch(() => undefined)),
}

/** A minimal canvas-style JPEG header: SOI, APP0 "JFIF", then EOI. */
const JFIF = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9])
/** The same file as a phone camera writes it: an APP1 "Exif" segment straight after SOI. */
const WITH_EXIF = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xff, 0xd9])

const nearScanId = crypto.randomUUID()

beforeAll(async () => {
  // Dates in 2001 keep this file's trend history apart from other tests' 2026 weigh-ins.
  await db.batch([
    db.insert(weight_logs).values({ date: '2001-03-01', weight_kg: 100 }),
    db.insert(weight_logs).values({ date: '2001-03-03', weight_kg: 96 }),
    // Confirmed scans 8 days before and 13 days after the photo; an unconfirmed one on the photo's own day is ignored.
    db.insert(scans).values({ id: nearScanId, scanned_at: '2001-03-02T16:00:00.000Z', date: '2001-03-02', confirmed: true, body_fat_pct: 30.6, weight_kg: 99.2 }),
    db.insert(scans).values({ scanned_at: '2001-03-23T16:00:00.000Z', date: '2001-03-23', confirmed: true, body_fat_pct: 29.9, weight_kg: 97.5 }),
    db.insert(scans).values({ scanned_at: '2001-03-10T16:00:00.000Z', date: '2001-03-10', confirmed: false }),
  ])
})

afterEach(async () => {
  await Promise.all(pending.splice(0))
})

describe('progress photos', () => {
  it("tags a photo with the day's trend weight and the nearest confirmed scan, and serves it through a signed URL", async () => {
    const id = crypto.randomUUID()
    // As the route parses the query string: the instant normalised to UTC, sizes from digits.
    const query = PhotoUploadQuery.parse({
      id,
      taken_at: '2001-03-10T07:30:00-07:00', // 07:30 MST on 2001-03-10
      pose: 'front',
      width: '768',
      height: '1024',
      content_type: 'image/jpeg',
    })
    const upload = { ...query, image: JFIF.slice().buffer }
    const photo = await uploadPhoto(deps, upload)

    // trend(03-01) = 100; trend(03-03) = 100 + 0.25 × (96 − 100) = 99; carried forward to 03-10.
    expect(photo).toMatchObject({ id, date: '2001-03-10', pose: 'front', weight_kg: 99, taken_at: '2001-03-10T14:30:00.000Z', width: 768, height: 1024 })
    expect(photo.nearest_scan).toEqual({ id: nearScanId, date: '2001-03-02', body_fat_pct: 30.6, weight_kg: 99.2 })
    // Signed for 30 minutes from now.
    expect(photo.url_expires_at).toBe('2001-03-10T18:30:00.000Z')

    const replay = await uploadPhoto(deps, { ...upload, pose: 'back' })
    expect(replay.pose).toBe('front')

    const listed = await listPhotos(deps, { pose: 'front', from: '2001-03-01', to: '2001-03-31' })
    expect(listed.map((p) => p.id)).toEqual([id])

    const url = new URL(photo.url, 'http://localhost')
    const key = decodeURIComponent(url.pathname.slice('/api/files/'.length))
    expect(key).toBe(`progress-photos/${id}.jpg`)
    const served = await serveSignedFile(deps, { key: key as never, exp: url.searchParams.get('exp')!, sig: url.searchParams.get('sig')! })
    expect(served.headers.get('content-type')).toBe('image/jpeg')
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(JFIF)

    await removePhoto(deps, id)
    await Promise.all(pending.splice(0))
    expect(await listPhotos(deps, { from: '2001-03-01', to: '2001-03-31' })).toEqual([])
    expect(await env.FILES.head(key)).toBeNull()
  })

  it('refuses bytes that still carry EXIF', async () => {
    await expect(
      uploadPhoto(deps, {
        id: crypto.randomUUID(),
        taken_at: '2001-03-10T14:30:00.000Z',
        pose: 'side',
        width: 768,
        height: 1024,
        content_type: 'image/jpeg',
        image: WITH_EXIF.slice().buffer,
      }),
    ).rejects.toMatchObject({ status: 422, code: 'exif_present' })
  })

  it('never reaches an LLM: upload, list, view and remove make no outbound call and queue no job, with every key set', async () => {
    // Every LLM provider is reached through fetch: a recording fake stands in for the network.
    const outbound: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      outbound.push(input instanceof Request ? input.url : String(input))
      return Response.json({ error: 'no network in this test' }, { status: 503 })
    })
    const keyed = { ...env, GEMINI_API_KEY: 'k', ZAI_API_KEY: 'k', OPENROUTER_API_KEY: 'k', GROQ_API_KEY: 'k' }
    const app = createApp()
    const jobsBefore = await db.$count(ai_jobs)
    try {
      const id = crypto.randomUUID()
      const query = new URLSearchParams({ id, taken_at: '2001-03-11T14:30:00.000Z', pose: 'back', width: '768', height: '1024', content_type: 'image/jpeg' })
      const up = await app.request(
        `http://localhost/api/photos?${query}`,
        { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: JFIF.slice() },
        keyed,
      )
      expect(up.status, await up.clone().text()).toBe(201)
      const list = await app.request('http://localhost/api/photos?from=2001-03-01&to=2001-03-31', {}, keyed)
      const photos = (await list.json()) as ProgressPhoto[]
      expect(photos.map((p) => p.id)).toContain(id)
      const view = await app.request(`http://localhost${photos.find((p) => p.id === id)!.url}`, {}, keyed)
      expect(view.status).toBe(200)
      expect((await app.request(`http://localhost/api/photos/${id}`, { method: 'DELETE' }, keyed)).status).toBe(200)
      await Promise.all(pending.splice(0))
    } finally {
      vi.restoreAllMocks()
    }
    expect(outbound).toEqual([])
    expect(await db.$count(ai_jobs)).toBe(jobsBefore)
  })
})

// ── Crafted files: what a camera, an editor or a hand-made file can carry ─────────────────────────────────────────
const enc = (s: string) => new TextEncoder().encode(s)
const bytes = (...parts: (Uint8Array | number[])[]) => {
  const all = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)))
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of all) {
    out.set(p, at)
    at += p.length
  }
  return out
}
/** One JPEG marker segment: FF marker, a 2-byte big-endian length (payload + 2), the payload. */
const segment = (marker: number, payload: Uint8Array) => bytes([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff], payload)
/** SOI, the segments, then SOS with a little entropy-coded data and EOI. */
const jpeg = (...segments: Uint8Array[]) => bytes([0xff, 0xd8], ...segments, [0xff, 0xda, 0x00, 0x02, 0x12, 0x34, 0xff, 0xd9]).buffer
const APP0 = segment(0xe0, bytes(enc('JFIF\0'), [1, 1, 0, 0, 1, 0, 1, 0, 0]))
const EXIF_GPS = segment(0xe1, bytes(enc('Exif\0\0'), enc('MM\0*GPS-LAT-51.04-LON-114.07')))
const XMP_GPS = segment(0xe1, enc('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><exif:GPSLatitude>51,2.4N</exif:GPSLatitude></x:xmpmeta>'))
const ICC = segment(0xe2, new Uint8Array(65_000)) // e.g. a colour profile: harmless, and big

/** One PNG chunk: 4-byte length, type, data, CRC (not checked by the Worker). */
const chunk = (type: string, data: Uint8Array) => {
  const n = data.length
  return bytes([n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff], enc(type), data, [0, 0, 0, 0])
}
const png = (...chunks: Uint8Array[]) =>
  bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], chunk('IHDR', new Uint8Array(13)), ...chunks, chunk('IEND', new Uint8Array(0))).buffer
const IDAT = chunk('IDAT', new Uint8Array(32))

/** One RIFF chunk: fourcc, 4-byte little-endian size, data padded to even. */
const riff = (fourcc: string, data: Uint8Array) => {
  const n = data.length
  return bytes(enc(fourcc), [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24], data, n % 2 ? [0] : [])
}
const webp = (...chunks: Uint8Array[]) => {
  const body = bytes(enc('WEBP'), ...chunks)
  const n = body.length
  return bytes(enc('RIFF'), [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24], body).buffer
}
const VP8 = riff('VP8 ', new Uint8Array(30))
const vp8x = (flags: number) => riff('VP8X', bytes([flags, 0, 0, 0], new Uint8Array(6)))

describe('metadata in uploaded images', () => {
  const verdict = (buf: ArrayBuffer, type: Parameters<typeof checkPhotoBytes>[1]) => {
    try {
      checkPhotoBytes(buf, type)
      return 'ok'
    } catch (e) {
      return (e as { code?: string }).code ?? 'threw'
    }
  }

  it('JPEG: a canvas-style file passes; Exif, Exif past 128 KB of other segments, and XMP GPS are refused', () => {
    expect(verdict(jpeg(APP0), 'image/jpeg')).toBe('ok')
    expect(verdict(jpeg(APP0, ICC, ICC), 'image/jpeg')).toBe('ok')
    expect(verdict(jpeg(EXIF_GPS), 'image/jpeg')).toBe('exif_present')
    expect(verdict(jpeg(APP0, ICC, ICC, EXIF_GPS), 'image/jpeg')).toBe('exif_present')
    expect(verdict(jpeg(APP0, XMP_GPS), 'image/jpeg')).toBe('exif_present')
    // Lost sync before the image data (not a marker where one must be): not a well-formed JPEG.
    expect(verdict(bytes([0xff, 0xd8], APP0, [0x00, 0x00, 0xff, 0xe1, 0, 4, 0, 0]).buffer, 'image/jpeg')).toBe('not_an_image')
  })

  it('PNG: a plain file passes; eXIf, tEXt, iTXt and zTXt chunks are refused, before or after the image data', () => {
    expect(verdict(png(IDAT), 'image/png')).toBe('ok')
    for (const type of ['eXIf', 'tEXt', 'iTXt', 'zTXt']) {
      expect(verdict(png(chunk(type, enc('GPS 51.04 -114.07')), IDAT), 'image/png'), type).toBe('exif_present')
      expect(verdict(png(IDAT, chunk(type, enc('Comment\0phone'))), 'image/png'), type).toBe('exif_present')
    }
    expect(verdict(bytes([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).buffer, 'image/png')).toBe('not_an_image')
  })

  it('WebP: a plain file passes; EXIF and XMP chunks (or the VP8X flags for them) are refused', () => {
    expect(verdict(webp(VP8), 'image/webp')).toBe('ok')
    expect(verdict(webp(vp8x(0x10), VP8), 'image/webp')).toBe('ok') // alpha flag only
    expect(verdict(webp(vp8x(0), VP8, riff('EXIF', enc('MM\0*GPS'))), 'image/webp')).toBe('exif_present')
    expect(verdict(webp(vp8x(0), VP8, riff('XMP ', enc('<x:xmpmeta/>'))), 'image/webp')).toBe('exif_present')
    expect(verdict(webp(vp8x(0x08), VP8), 'image/webp')).toBe('exif_present')
    expect(verdict(webp(vp8x(0x04), VP8), 'image/webp')).toBe('exif_present')
  })
})
