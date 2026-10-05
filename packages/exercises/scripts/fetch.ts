// Owns: downloading free-exercise-db at a pinned commit — dist/exercises.json into data/ (committed) and, with --images, the step images into images/ (gitignored).
// Usage: pnpm --filter @fitness/exercises run fetch:data   (JSON only)  |  run fetch:images  (JSON + ~1,750 step images)
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { FREE_EXERCISE_DB_SHA } from '../src/lib/source'

const RAW = `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${FREE_EXERCISE_DB_SHA}`
const ROOT = path.resolve(import.meta.dirname, '..')
const DATA_FILE = path.join(ROOT, 'data', 'free-exercise-db.json')
const IMAGES_DIR = path.join(ROOT, 'images')
const CONCURRENCY = 8
const RETRIES = 3

async function download(url: string): Promise<Uint8Array> {
  let lastError: unknown
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      return new Uint8Array(await res.arrayBuffer())
    } catch (error) {
      lastError = error
      await new Promise((r) => setTimeout(r, 500 * attempt))
    }
  }
  throw lastError
}

async function exists(file: string): Promise<boolean> {
  try {
    return (await stat(file)).size > 0
  } catch {
    return false
  }
}

/** Runs `worker` over `items` with at most `limit` in flight. */
async function pool<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await worker(items[next++] as T)
  })
  await Promise.all(lanes)
}

async function main(): Promise<void> {
  const withImages = process.argv.includes('--images')

  const json = await download(`${RAW}/dist/exercises.json`)
  const records = JSON.parse(new TextDecoder().decode(json)) as { id: string; images: string[] }[]
  await mkdir(path.dirname(DATA_FILE), { recursive: true })
  await writeFile(DATA_FILE, json)
  console.log(
    `exercises: ${records.length} records → ${path.relative(process.cwd(), DATA_FILE)} @ ${FREE_EXERCISE_DB_SHA}`,
  )

  if (!withImages) return

  // Source image paths are '<id>/<n>.jpg'; they land at images/<id>/<n>.jpg (served as /exercises/<id>/<n>.jpg).
  const images = records.flatMap((r) => r.images)
  let fetched = 0
  let skipped = 0
  const failed: string[] = []
  await pool(images, CONCURRENCY, async (rel) => {
    const target = path.join(IMAGES_DIR, rel)
    if (await exists(target)) {
      skipped++
      return
    }
    try {
      const bytes = await download(`${RAW}/exercises/${rel}`)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, bytes)
      fetched++
      if (fetched % 200 === 0) console.log(`images: ${fetched} fetched…`)
    } catch (error) {
      failed.push(`${rel}: ${String(error)}`)
    }
  })
  console.log(
    `images: ${fetched} fetched, ${skipped} already present, ${failed.length} failed (of ${images.length})`,
  )
  if (failed.length > 0) {
    console.error(failed.join('\n'))
    process.exitCode = 1
  }
}

await main()
