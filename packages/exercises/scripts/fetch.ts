// Owns: downloading free-exercise-db at a pinned commit — dist/exercises.json into data/ (committed) and, with --images, the step images into images/ (gitignored)
// plus a 112 px WebP thumbnail per exercise (images/<id>/thumb.webp, ./lib/thumbs).
// Usage: pnpm --filter @fitness/exercises run fetch:data   (JSON only)  |  run fetch:images  (JSON + ~1,750 step images + thumbnails)
//        pnpm --filter @fitness/exercises exec tsx scripts/fetch.ts --thumbs   (thumbnails only, from the images on disk; no network)
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { FREE_EXERCISE_DB_SHA } from '../src/lib/source'
import { download, exists, pool } from './lib/download'
import { writeThumbnails } from './lib/thumbs'

const RAW = `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${FREE_EXERCISE_DB_SHA}`
const ROOT = path.resolve(import.meta.dirname, '..')
const DATA_FILE = path.join(ROOT, 'data', 'free-exercise-db.json')
const IMAGES_DIR = path.join(ROOT, 'images')
const CONCURRENCY = 8

/** First step image of each record ('<id>/0.jpg'): the thumbnail's source. */
const firstImages = (records: readonly { images: string[] }[]) => records.flatMap((r) => r.images.slice(0, 1))

async function main(): Promise<void> {
  if (process.argv.includes('--thumbs')) {
    const records = JSON.parse(await readFile(DATA_FILE, 'utf8')) as { id: string; images: string[] }[]
    if (!(await writeThumbnails(IMAGES_DIR, firstImages(records)))) process.exitCode = 1
    return
  }
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
  await writeThumbnails(IMAGES_DIR, firstImages(records))
}

await main()
