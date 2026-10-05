// Owns: the `foods` table as the nutrition cache — lookups by barcode, by (source, source_id) and by name tokens, and the
// upsert by (source, source_id) that stores what a source returned. LLM estimates (source 'llm') never count as matches.
// Also counts external calls per source and UTC day in `provider_usage` (keys 'openfoodfacts', 'usda_fdc').
import { and, asc, desc, eq, inArray, ne, or, sql, type SQL } from 'drizzle-orm'
import { foods, provider_usage, type Db, type Row } from '../../../db'
import type { RemoteSource } from './gate'
import type { FoodDraft } from './normalise'

export type FoodRow = Row<typeof foods>
type SourceRef = { source: FoodRow['source']; source_id: string }

/** 15 bound values per row and D1 allows 100 per statement: 6 rows (90) + 1 for updated_at. */
const ROWS_PER_STATEMENT = 6
/** Rows the name search hands to the scorer (the scorer runs in the Worker's 10 ms CPU budget). */
const SEARCH_ROWS = 30

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

/**
 * Foods whose name or brand contains any of the stems (`LIKE '%stem%'`), most stems matched first, then names that
 * start with a stem, then shorter names. Ranking happens in SQL so only SEARCH_ROWS rows reach the scorer.
 */
export async function searchByStems(db: Db, stems: string[]): Promise<FoodRow[]> {
  if (stems.length === 0) return []
  const hay = sql`(${foods.name} || ' ' || coalesce(${foods.brand}, ''))`
  const esc = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`) // "2%" must match a literal percent sign
  const hits = stems.map((s) => sql`(${hay} LIKE ${`%${esc(s)}%`} ESCAPE '\\')`)
  const leads = stems.map((s) => sql`(${foods.name} LIKE ${`${esc(s)}%`} ESCAPE '\\')`)
  return db
    .select()
    .from(foods)
    .where(and(ne(foods.source, 'llm'), or(...hits)))
    .orderBy(desc(sql.join(hits, sql` + `)), desc(sql.join(leads, sql` + `)), asc(sql`length(${foods.name})`))
    .limit(SEARCH_ROWS)
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

const USAGE_KEY: Record<RemoteSource, string> = { off: 'openfoodfacts', usda: 'usda_fdc' }

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
