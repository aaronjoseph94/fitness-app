// Owns: downloading the matched ExerciseDB GIFs listed in data/media-map.json into media/<exercise-id>.gif (gitignored).
// Usage: pnpm --filter @fitness/exercises run fetch:media   (~460 GIFs, ~45 MB; skips files already present)
// The web build copies media/ to dist/media/exercises/, so each GIF is served at /media/exercises/<exercise-id>.gif.
import { mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import mediaMap from '../data/media-map.json' with { type: 'json' }
import { download, exists, pool } from './lib/download'
import type { MediaMap } from './lib/match'

const MEDIA_DIR = path.resolve(import.meta.dirname, '..', 'media')
const CONCURRENCY = 4 // a modest load on static.exercisedb.dev

async function main(): Promise<void> {
  const entries = Object.entries(mediaMap as MediaMap)
  await mkdir(MEDIA_DIR, { recursive: true })
  let fetched = 0
  let skipped = 0
  let bytes = 0
  const failed: string[] = []
  await pool(entries, CONCURRENCY, async ([id, match]) => {
    const target = path.join(MEDIA_DIR, `${id}.gif`)
    if (await exists(target)) {
      skipped++
      return
    }
    try {
      const gif = await download(match.url)
      // Write whole files only, so an interrupted run never leaves a truncated GIF that a re-run would skip.
      await writeFile(`${target}.part`, gif)
      await rename(`${target}.part`, target)
      fetched++
      bytes += gif.byteLength
      if (fetched % 50 === 0) console.log(`media: ${fetched} fetched…`)
    } catch (error) {
      failed.push(`${id} (${match.url}): ${String(error)}`)
    }
  })
  console.log(
    `media: ${fetched} fetched (${(bytes / 1e6).toFixed(1)} MB), ${skipped} already present, ${failed.length} failed (of ${entries.length}) → ${path.relative(process.cwd(), MEDIA_DIR)}`,
  )
  if (failed.length > 0) {
    console.error(failed.join('\n'))
    process.exitCode = 1
  }
}

await main()
