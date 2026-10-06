// Owns: the `foods` table as the nutrition cache — lookups by barcode, by (source, source_id) and full-text by name, and the
// upsert by (source, source_id) that stores what a source returned. LLM estimates (source 'llm') never count as matches.
// Also counts external calls per source and UTC day in `provider_usage` (key 'openfoodfacts').
import { and, desc, eq, getTableColumns, inArray, ne, or, sql, type SQL } from 'drizzle-orm'
import { foods, provider_usage, type Db, type Row } from '../../../db'
import type { RemoteSource } from './gate'
import type { FoodDraft } from './normalise'

export type FoodRow = Row<typeof foods>
type SourceRef = { source: FoodRow['source']; source_id: string }

/** 15 bound values per row and D1 allows 100 per statement: 6 rows (90) + 1 for updated_at. */
const ROWS_PER_STATEMENT = 6
/** Rows the name search hands to the scorer (the scorer runs in the Worker's 10 ms CPU budget). */
const SEARCH_ROWS = 40

/** Barcode variants that name one product: UPC-A (12) and its EAN-13 form with a leading 0. */
export function barcodeVariants(code: string): string[] {
  if (code.length === 12) return [code, `0${code}`]
  if (code.length === 13 && code.startsWith('0')) return [code, code.slice(1)]
  return [code]
}

/** Aaron's own food for that barcode first, then the cached Open Food Facts product. */
export async function findByBarcode(db: Db, code: string): Promise<FoodRow | undefined> {
  const [row] = await db
    .select()
    .from(foods)
    .where(and(inArray(foods.barcode, barcodeVariants(code)), ne(foods.source, 'llm')))
    .orderBy(desc(sql`${foods.source} = 'user'`))
    .limit(1)
  return row
}

export async function findBySourceIds(db: Db, refs: SourceRef[]): Promise<FoodRow[]> {
  if (refs.length === 0) return []
  return db
    .select()
    .from(foods)
    .where(or(...refs.map((r) => and(eq(foods.source, r.source), eq(foods.source_id, r.source_id)))))
}

/** Every foods column but `raw` (a cached source record can be tens of KB; search never needs it). */
const { raw: _raw, ...SEARCH_COLUMNS } = getTableColumns(foods)

/**
 * Foods matching an FTS5 query over foods_fts(name, brand) (porter tokenizer; kept in sync with `foods` by triggers,
 * migration 0002_foods_fts), best bm25 first (name weighted over brand), at most SEARCH_ROWS. An indexed lookup, never a
 * scan of `foods`. LLM estimates are left out. `raw` is not read (null in the result).
 */
export async function searchLocal(db: Db, match: string): Promise<FoodRow[]> {
  const rows = await db
    .select(SEARCH_COLUMNS)
    .from(foods)
    .where(
      and(
        ne(foods.source, 'llm'),
        sql`${foods.id} IN (SELECT food_id FROM foods_fts WHERE foods_fts MATCH ${match} ORDER BY bm25(foods_fts, 0, 1.0, 0.5) LIMIT ${SEARCH_ROWS})`,
      ),
    )
  return rows.map((r) => ({ ...r, raw: null }))
}

const excluded = (col: string): SQL => sql.raw(`excluded."${col}"`)

/** Upsert drafts by (source, source_id) and return the stored rows (existing ids kept), in one db.batch. */
export async function remember(db: Db, drafts: FoodDraft[], now: Date): Promise<FoodRow[]> {
  const unique = [...new Map(drafts.map((d) => [`${d.source}:${d.source_id}`, d])).values()]
  if (unique.length === 0) return []
  const statements = []
  for (let i = 0; i < unique.length; i += ROWS_PER_STATEMENT) {
    const chunk = unique.slice(i, i + ROWS_PER_STATEMENT)
    statements.push(
      db
        .insert(foods)
        .values(chunk.map((d) => ({ ...d, id: crypto.randomUUID() })))
        .onConflictDoUpdate({
          target: [foods.source, foods.source_id],
          set: {
            barcode: excluded('barcode'),
            name: excluded('name'),
            brand: excluded('brand'),
            serving_g: excluded('serving_g'),
            kcal_per_100g: excluded('kcal_per_100g'),
            protein_g: excluded('protein_g'),
            carbs_g: excluded('carbs_g'),
            fat_g: excluded('fat_g'),
            fibre_g: excluded('fibre_g'),
            sugar_g: excluded('sugar_g'),
            sodium_mg: excluded('sodium_mg'),
            raw: excluded('raw'),
            updated_at: now.toISOString(),
          },
        })
        .returning(),
    )
  }
  const [first, ...rest] = statements
  const results = await db.batch([first!, ...rest])
  return results.flat()
}

const USAGE_KEY: Record<RemoteSource, string> = { off: 'openfoodfacts' }

/** One more request for this source today (UTC day), insert-or-increment in one statement. */
export async function recordUsage(db: Db, source: RemoteSource, now: Date): Promise<void> {
  await db
    .insert(provider_usage)
    .values({ provider: USAGE_KEY[source], day: now.toISOString().slice(0, 10), requests: 1 })
    .onConflictDoUpdate({
      target: [provider_usage.provider, provider_usage.day],
      set: { requests: sql`${provider_usage.requests} + 1`, updated_at: now.toISOString() },
    })
}
