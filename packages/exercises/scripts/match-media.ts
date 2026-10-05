// Owns: regenerating data/media-map.json (free-exercise-db id → ExerciseDB GIF, score ≥ 85) and the coverage block in SOURCE.md.
// Usage: pnpm --filter @fitness/exercises run match:media            (writes both files)
//        pnpm --filter @fitness/exercises run match:media -- --review (also prints every match, lowest score first)
// Offline and deterministic: reads only data/free-exercise-db.json and data/exercisedb-index.json.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { matchMedia, MIN_SCORE, type ExerciseDbEntry, type MatchableExercise } from './lib/match'

const ROOT = path.resolve(import.meta.dirname, '..')
const LIBRARY_FILE = path.join(ROOT, 'data', 'free-exercise-db.json')
const INDEX_FILE = path.join(ROOT, 'data', 'exercisedb-index.json')
const MAP_FILE = path.join(ROOT, 'data', 'media-map.json')
const SOURCE_FILE = path.join(ROOT, 'SOURCE.md')
const START = '<!-- media-coverage:start -->'
const END = '<!-- media-coverage:end -->'

type LibraryRecord = MatchableExercise & { category: string }

const readJson = async <T>(file: string) => JSON.parse(await readFile(file, 'utf8')) as T

async function main(): Promise<void> {
  const library = await readJson<LibraryRecord[]>(LIBRARY_FILE)
  const index = await readJson<ExerciseDbEntry[]>(INDEX_FILE)
  const map = matchMedia(library, index)

  // One entry per line, sorted by id, so a re-run diffs cleanly.
  const ids = Object.keys(map).sort()
  const lines = ids.map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(map[id])}`)
  await writeFile(MAP_FILE, `{\n${lines.join(',\n')}\n}\n`)

  // Gym exercises = what the allowed exercise set can contain (machines and free weights, no stretches).
  const isGym = (r: LibraryRecord) =>
    r.category !== 'stretching' &&
    r.equipment !== null &&
    !['body only', 'other', 'foam roll'].includes(r.equipment)
  const gym = library.filter(isGym)
  const gymMatched = gym.filter((r) => map[r.id]).length
  const band = (lo: number, hi: number) =>
    ids.filter((id) => map[id]!.score >= lo && map[id]!.score < hi).length
  const sources = new Set(ids.map((id) => map[id]!.source_id))
  const pct = (n: number, d: number) => `${Math.round((100 * n) / d)}%`

  // Blank lines around the sentence keep the block Prettier-stable.
  const summary = [
    START,
    '',
    `Coverage (score ≥ ${MIN_SCORE}, from \`scripts/match-media.ts\`): **${ids.length} of ${library.length}** exercises (${pct(ids.length, library.length)}) have a GIF, using ${sources.size} distinct ExerciseDB GIFs; **${gymMatched} of ${gym.length}** gym exercises (machines and free weights, no stretches: ${pct(gymMatched, gym.length)}). By score: ${band(95, 101)} at ≥ 95, ${band(90, 95)} at 90–95, ${band(85, 90)} at 85–90.`,
    '',
    END,
  ].join('\n')
  const source = await readFile(SOURCE_FILE, 'utf8')
  const at = source.indexOf(START)
  const until = source.indexOf(END)
  if (at === -1 || until === -1) throw new Error(`SOURCE.md is missing the ${START} … ${END} block`)
  await writeFile(SOURCE_FILE, source.slice(0, at) + summary + source.slice(until + END.length))

  if (process.argv.includes('--review')) {
    const byName = new Map(library.map((r) => [r.id, r]))
    for (const id of [...ids].sort((a, b) => map[a]!.score - map[b]!.score)) {
      const m = map[id]!
      console.log(
        `${m.score.toFixed(1)}  ${byName.get(id)!.name} [${byName.get(id)!.equipment}]  →  ${m.matched_name} (${m.source_id})`,
      )
    }
  }
  console.log(summary.split('\n')[2])
}

await main()
