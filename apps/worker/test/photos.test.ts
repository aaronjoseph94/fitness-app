// Owns: tests at the photos seam — an upload tagged with the day's trend weight and the nearest confirmed scan, served
// back through a short-lived signed URL; EXIF-carrying bytes refused; and the privacy rail (the photos module never
// imports the llm or jobs modules, so a progress photo cannot reach any LLM).
import { PhotoUploadQuery } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createDb, scans, weight_logs } from '../src/db'
import { serveSignedFile } from '../src/modules/files'
import type { Deps } from '../src/lib/deps'
import { listPhotos, removePhoto, uploadPhoto } from '../src/modules/photos'

declare global {
  interface ImportMeta {
    /** Vite's static glob import (vitest transforms it); typed here because the worker package has no vite/client types. */
    glob(pattern: string, options: { query: '?raw'; import: 'default'; eager: true }): Record<string, string>
  }
}

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
    expect(photo).toMatchObject({ id, date: '2001-03-10', pose: 'front', weight_kg: 99, taken_at: '2001-03-10T14:30:00.000Z' })
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

  it('never imports the llm or jobs modules (progress photos are never sent to any LLM)', () => {
    const sources = import.meta.glob('../src/modules/photos/**/*.ts', { query: '?raw', import: 'default', eager: true })
    expect(Object.keys(sources).length).toBeGreaterThan(0)
    for (const [file, source] of Object.entries(sources)) {
      expect(source, file).not.toMatch(/from\s+['"][./]*(modules\/)?(llm|jobs)(\/|['"])/)
    }
  })
})
