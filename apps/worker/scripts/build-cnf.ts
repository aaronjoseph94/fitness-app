// Owns: building seed/foods/cnf.json — the Canadian Nutrient File (Health Canada, CNF 2026) reduced to one compact row per
// food: name, food group, energy and the core nutrients per 100 g, and a typical serving in grams.
// Run (from apps/worker): pnpm exec tsx scripts/build-cnf.ts [--dir <folder holding the CSVs>]
//   Without --dir it downloads the CSVs from open.canada.ca (Open Government Licence – Canada). Behind a proxy, Node's
//   fetch needs NODE_USE_ENV_PROXY=1. build-seed.ts then loads the JSON into `foods` (source 'cnf', source_id = food code).
// Health Canada's CNF web API answers one food per request, so the bulk CSVs are the source. CNF 2026 on open.canada.ca
// supersedes the 2015 zip on canada.ca (which also refused automated downloads from here).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const OUT = path.resolve(import.meta.dirname, '..', '..', '..', 'seed', 'foods', 'cnf.json')

/** CNF 2026 on open.canada.ca (dataset 1b6139bd-ed7e-4043-bc28-ff00e10f3109). Each link redirects to a signed blob URL. */
const DATASET = 'https://open.canada.ca/data/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109/resource'
const FILES = {
  food_name: `${DATASET}/e1ffee62-58cb-4e3e-b359-115c658388ad/download/food_name.csv`,
  nutrient_amount: `${DATASET}/0ff718fc-1133-4154-80c5-3d619e6c63be/download/nutrient_amount.csv`,
  measure_weight_conversion: `${DATASET}/bb76d816-3ac0-4749-8c4b-f0dbfd0fac76/download/measure_weight_conversion.csv`,
  measure_name: `${DATASET}/104adbc9-f4cc-40b1-9aaa-08290648e24b/download/measure_name.csv`,
} as const
type FileKey = keyof typeof FILES

/** CNF nutrient codes (nutrient_name.csv) → our columns, with the decimals CNF itself reports. */
const NUTRIENTS = {
  208: { key: 'kcal', dp: 0 }, // Energy (kilocalories)
  203: { key: 'protein_g', dp: 2 }, // Protein
  205: { key: 'carbs_g', dp: 2 }, // Carbohydrate, total (by difference)
  204: { key: 'fat_g', dp: 2 }, // Fat (total lipids)
  291: { key: 'fibre_g', dp: 1 }, // Fibre, total dietary
  269: { key: 'sugar_g', dp: 2 }, // Sugars, total
  307: { key: 'sodium_mg', dp: 0 }, // Sodium (mg)
} as const
type NutrientKey = (typeof NUTRIENTS)[keyof typeof NUTRIENTS]['key']

/** Food groups left out: baby foods only produce false matches for an adult's meals ("Babyfood, banana…"). */
const EXCLUDED_GROUPS = new Set([3])
/** Measure_Type_Code 6 = user-defined household measures (3 = refuse, 9 = yield). */
const HOUSEHOLD_MEASURE = 6

const CNF_COLUMNS = [
  'code',
  'name',
  'group',
  'kcal',
  'protein_g',
  'carbs_g',
  'fat_g',
  'fibre_g',
  'sugar_g',
  'sodium_mg',
  'serving_g',
] as const

// ── CSV (RFC 4180: quoted fields, doubled quotes, CRLF; strips the UTF-8 BOM) ───────────────────────────────────

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') (field += '"'), i++
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') row.push(field), (field = '')
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field), rows.push(row), (row = []), (field = '')
    } else field += ch
  }
  if (field !== '' || row.length) row.push(field), rows.push(row)
  const [header = [], ...body] = rows
  return body
    .filter((r) => r.length > 1 || r[0] !== '')
    .map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

async function load(key: FileKey, dir: string | undefined): Promise<Record<string, string>[]> {
  if (dir) return parseCsv(readFileSync(path.join(dir, `${key}.csv`), 'utf8'))
  const res = await fetch(FILES[key], { headers: { 'User-Agent': 'FitnessTracker/1.0 (personal, non-commercial)' } })
  if (!res.ok) throw new Error(`CNF download failed for ${key}: HTTP ${res.status} ${FILES[key]}`)
  return parseCsv(await res.text())
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp

/**
 * A typical serving: the household measure "1 medium …" if CNF lists one, else the first "1 <unit>" count measure
 * (1 egg, 1 slice, 1 large …) that is not a volume or a weight. Null when the food only has ml/g measures.
 */
function servingGrams(measures: { desc: string; grams: number }[]): number | null {
  const counts = measures.filter(
    (m) => m.grams > 0 && /^1 /.test(m.desc) && !/^1 (ml|l|g|kg|tsp|tbsp|cup)\b/i.test(m.desc),
  )
  const pick = counts.find((m) => /\bmedium\b/i.test(m.desc)) ?? counts[0]
  return pick ? round(pick.grams, 1) : null
}

async function main() {
  const dirFlag = process.argv.indexOf('--dir')
  const dir = dirFlag > -1 ? path.resolve(process.argv[dirFlag + 1] ?? '.') : undefined

  const [names, amounts, conversions, measureNames] = await Promise.all([
    load('food_name', dir),
    load('nutrient_amount', dir),
    load('measure_weight_conversion', dir),
    load('measure_name', dir),
  ])

  const nutrients = new Map<number, Partial<Record<NutrientKey, number>>>()
  for (const a of amounts) {
    const spec = NUTRIENTS[Number(a.Nutrient_Code) as keyof typeof NUTRIENTS]
    const value = Number(a.Nutrient_Amount)
    if (!spec || a.Nutrient_Amount === '' || !Number.isFinite(value)) continue
    const code = Number(a.Food_Code)
    const entry = nutrients.get(code) ?? {}
    entry[spec.key] = round(value, spec.dp)
    nutrients.set(code, entry)
  }

  const measureDesc = new Map(measureNames.map((m) => [m.Measure_Code, m.Measure_Description_and_Unit_EN ?? '']))
  const measures = new Map<number, { desc: string; grams: number }[]>()
  for (const c of conversions) {
    if (Number(c.Measure_Type_Code) !== HOUSEHOLD_MEASURE) continue
    const code = Number(c.Food_Code)
    const list = measures.get(code) ?? []
    list.push({ desc: measureDesc.get(c.Measure_Code ?? '') ?? '', grams: Number(c.Measure_Weight_Conversion) })
    measures.set(code, list)
  }

  const rows: (string | number | null)[][] = []
  let skippedNoEnergy = 0
  for (const f of names) {
    const code = Number(f.Food_Code)
    const group = Number(f.CNF_Food_Group_Code)
    if (!Number.isInteger(code) || EXCLUDED_GROUPS.has(group)) continue
    const n = nutrients.get(code)
    if (n?.kcal === undefined) {
      skippedNoEnergy++
      continue
    }
    rows.push([
      code,
      f.Food_Description_EN ?? '',
      group,
      n.kcal,
      n.protein_g ?? null,
      n.carbs_g ?? null,
      n.fat_g ?? null,
      n.fibre_g ?? null,
      n.sugar_g ?? null,
      n.sodium_mg ?? null,
      servingGrams(measures.get(code) ?? []),
    ])
  }
  rows.sort((a, b) => Number(a[0]) - Number(b[0]))

  // One food per line keeps diffs readable when Health Canada publishes an update.
  const header = {
    '//': 'Owns: the CNF foods seed (source cnf). GENERATED by apps/worker/scripts/build-cnf.ts; regenerate, do not edit.',
    source: 'Canadian Nutrient File 2026, Health Canada (open.canada.ca dataset 1b6139bd-ed7e-4043-bc28-ff00e10f3109)',
    licence: 'Open Government Licence – Canada',
    units: 'per 100 g edible portion; sodium in mg; serving_g is one typical household measure',
    excluded: 'food group 3 (baby foods); foods without an energy value',
    columns: CNF_COLUMNS,
  }
  const json = `${JSON.stringify(header).slice(0, -1)},"foods":[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`
  mkdirSync(path.dirname(OUT), { recursive: true })
  writeFileSync(OUT, json)
  console.log(
    `cnf: ${rows.length} foods → ${path.relative(process.cwd(), OUT)} (${(Buffer.byteLength(json) / 1024).toFixed(0)} KB; ${skippedNoEnergy} without energy skipped)`,
  )
}

await main()
