// Owns: the exercise thumbnails — images/<id>/thumb.webp, each exercise's first step image cropped square (centre) to
// 112 px (2× the largest list thumbnail, 56 px), WebP at quality 70: ~3 KB instead of a 60–95 KB JPEG. Served at
// /exercises/<id>/thumb.webp next to the step images (the web build copies the folder). sharp is not a dependency of
// this package: it resolves from the workspace (wrangler → miniflare ships it). Without it no thumbnails are written,
// and the app keeps showing the step JPEGs.
import { createRequire } from 'node:module'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { pool } from './download'

export const THUMB_PX = 112
export const THUMB_FILE = 'thumb.webp'
const QUALITY = 70
const CONCURRENCY = 8

interface SharpPipeline {
  resize(width: number, height: number, options: { fit: 'cover'; position: 'centre' }): SharpPipeline
  webp(options: { quality: number }): SharpPipeline
  toFile(file: string): Promise<unknown>
}
type Sharp = (input: string) => SharpPipeline

/** sharp from this package's own dependencies, else from the workspace's wrangler → miniflare; null when neither has it. */
async function loadSharp(): Promise<Sharp | null> {
  const name = 'sharp'
  try {
    return ((await import(name)) as { default: Sharp }).default
  } catch {
    // Not a dependency here: try the copy miniflare installs.
  }
  try {
    const worker = createRequire(path.resolve(import.meta.dirname, '../../../../apps/worker/package.json'))
    const wrangler = createRequire(worker.resolve('wrangler'))
    return createRequire(wrangler.resolve('miniflare'))(name) as Sharp
  } catch {
    return null
  }
}

async function mtime(file: string): Promise<number | null> {
  try {
    return (await stat(file)).mtimeMs
  } catch {
    return null
  }
}

/**
 * Write images/<id>/thumb.webp for every exercise whose first image is on disk and whose thumbnail is missing or older
 * than it. Returns false (and writes nothing) when sharp cannot be found.
 */
export async function writeThumbnails(imagesDir: string, firstImages: readonly string[]): Promise<boolean> {
  const sharp = await loadSharp()
  if (!sharp) {
    console.warn('thumbnails: sharp not found (neither a dependency here nor through wrangler → miniflare); skipped')
    return false
  }
  let written = 0
  let current = 0
  const failed: string[] = []
  await pool(firstImages, CONCURRENCY, async (rel) => {
    const source = path.join(imagesDir, rel)
    const target = path.join(path.dirname(source), THUMB_FILE)
    const sourceTime = await mtime(source)
    if (sourceTime === null) return
    const targetTime = await mtime(target)
    if (targetTime !== null && targetTime >= sourceTime) {
      current++
      return
    }
    try {
      await sharp(source).resize(THUMB_PX, THUMB_PX, { fit: 'cover', position: 'centre' }).webp({ quality: QUALITY }).toFile(target)
      written++
    } catch (error) {
      failed.push(`${rel}: ${String(error)}`)
    }
  })
  console.log(`thumbnails: ${written} written, ${current} up to date, ${failed.length} failed (${THUMB_PX} px WebP)`)
  if (failed.length > 0) console.error(failed.join('\n'))
  return failed.length === 0
}
