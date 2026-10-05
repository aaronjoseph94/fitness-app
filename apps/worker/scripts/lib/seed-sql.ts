// Owns: typed Drizzle inserts → literal D1-safe seed SQL (no bound params, ≤ 50 rows and < 100 KB per statement), and deterministic seed ids.
// Seed ids are UUID v5 of a stable name, so re-running a seed hits the same rows and local and remote ids agree.
import { createHash } from 'node:crypto'
import { getTableColumns, sql, type SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import type { SQLiteColumn, SQLiteTable, SQLiteUpdateSetSource } from 'drizzle-orm/sqlite-core'

const MAX_ROWS = 50
const MAX_BYTES = 90_000 // D1 caps one statement at 100 KB; keep headroom.
const SEED_NAMESPACE = '6f1d3c52-8a8e-4c55-9d3e-3f0b5e1f2a10'

/** RFC 4122 UUID v5 of `name` in the app's seed namespace: SHA-1(namespace ‖ name), version 5, variant 10. */
export function seedId(name: string): string {
  const ns = Buffer.from(SEED_NAMESPACE.replaceAll('-', ''), 'hex')
  const bytes = createHash('sha1').update(ns).update(name, 'utf8').digest().subarray(0, 16)
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = Buffer.from(bytes).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Drizzle builds the SQL (column mapping, JSON/boolean encoding, SQL defaults); nothing is executed. */
const builder = drizzle(async () => ({ rows: [] }))

function literal(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Non-finite number in seed: ${value}`)
    return String(value)
  }
  if (typeof value === 'bigint') return String(value)
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`
  throw new Error(`Unsupported seed value: ${JSON.stringify(value)}`)
}

/** Replace each `?` placeholder outside quoted strings/identifiers with its literal. */
function inline(query: string, params: unknown[]): string {
  let out = ''
  let quote: "'" | '"' | null = null
  let i = 0
  for (const ch of query) {
    if (quote) {
      if (ch === quote) quote = null
      out += ch
    } else if (ch === "'" || ch === '"') {
      quote = ch
      out += ch
    } else if (ch === '?') {
      if (i >= params.length) throw new Error('More placeholders than params')
      out += literal(params[i++])
    } else out += ch
  }
  if (i !== params.length) throw new Error(`Unused params: ${params.length - i}`)
  return out
}

export type Conflict<T extends SQLiteTable> =
  | 'ignore'
  /** Upsert on a unique column; `update` lists the columns the seed owns (others, e.g. Aaron's edits, are kept). */
  | { target: SQLiteColumn; update: (keyof T['$inferInsert'] & string)[] }

/** Literal multi-row INSERT statements for `rows`, chunked by row count and byte size. Each ends with ';'. */
export function insertSql<T extends SQLiteTable>(
  table: T,
  rows: T['$inferInsert'][],
  conflict: Conflict<T>,
): string[] {
  if (rows.length === 0) return []
  const columns = getTableColumns(table) as Record<string, SQLiteColumn>
  const render = (chunk: T['$inferInsert'][]): string => {
    const insert = builder.insert(table).values(chunk as never)
    const q =
      conflict === 'ignore'
        ? insert.onConflictDoNothing().toSQL()
        : insert
            .onConflictDoUpdate({
              target: conflict.target,
              set: Object.fromEntries(
                conflict.update.map((key): [string, SQL] => [
                  key,
                  sql.raw(`excluded."${columns[key]?.name ?? key}"`),
                ]),
              ) as SQLiteUpdateSetSource<T>,
            })
            .toSQL()
    return `${inline(q.sql, q.params)};`
  }
  const out: string[] = []
  const emit = (chunk: T['$inferInsert'][]) => {
    const text = render(chunk)
    if (Buffer.byteLength(text) <= MAX_BYTES) return void out.push(text)
    if (chunk.length === 1)
      throw new Error(`One seed row exceeds ${MAX_BYTES} bytes in ${text.slice(0, 60)}…`)
    const mid = Math.ceil(chunk.length / 2)
    emit(chunk.slice(0, mid))
    emit(chunk.slice(mid))
  }
  for (let start = 0; start < rows.length; start += MAX_ROWS) emit(rows.slice(start, start + MAX_ROWS))
  return out
}
