// Owns: reading one table page as JSON text built by SQLite, so the Worker never parses or re-serialises rows (free
// plan: 10 ms CPU). Each row becomes '{"col":' || json_quote(col) || … || '}' — concatenation rather than
// json_object(), because D1 caps a SQL function at 32 arguments — and the page is group_concat'ed in id order.
// A page whose text overflows D1's 2 MB value limit is halved and read again.
import { sql } from 'drizzle-orm'
import type { Db } from '../../../db'
import { ident, type TableSpec } from './tables'

export interface JsonPage {
  /** The rows as a JSON array text, e.g. '[{"id":"…","date":"2026-10-05",…}]'. */
  rows: string
  count: number
  /** Id of the last row; pass it back as the cursor while `more` is true. */
  last: string | null
  /** True when the page is full, so more rows may follow `last`. */
  more: boolean
}

const rowExpressions = new Map<string, string>()

/** '{"id":' || json_quote("id") || ',"date":' || json_quote("date") || '}' — JSON text of one row, cells as stored. */
function rowJson(spec: TableSpec): string {
  let expr = rowExpressions.get(spec.name)
  if (!expr) {
    const parts = spec.columns.map(
      (c, i) => `'${i === 0 ? '{' : ','}${JSON.stringify(c)}:' || json_quote(${ident(c)})`,
    )
    expr = `${parts.join(' || ')} || '}'`
    rowExpressions.set(spec.name, expr)
  }
  return expr
}

const tooBig = (e: unknown) =>
  /too big|TOOBIG/i.test(e instanceof Error ? `${e.message} ${String(e.cause ?? '')}` : String(e))

/** Rows of `spec` with id > `cursor` ('' = from the start), at most `limit`, in id order. */
export async function readPage(
  db: Db,
  spec: TableSpec,
  cursor: string,
  limit = spec.pageRows,
): Promise<JsonPage> {
  try {
    const row = await db.get<{ rows: string; n: number; last: string | null }>(sql`
      SELECT '[' || coalesce(group_concat(r, ','), '') || ']' AS rows, count(*) AS n, max(id) AS last
      FROM (SELECT id, ${sql.raw(rowJson(spec))} AS r FROM ${sql.raw(ident(spec.name))} WHERE id > ${cursor} ORDER BY id LIMIT ${limit})`)
    const count = row?.n ?? 0
    return { rows: row?.rows ?? '[]', count, last: row?.last ?? null, more: count === limit }
  } catch (e) {
    if (limit > 1 && tooBig(e)) return readPage(db, spec, cursor, Math.floor(limit / 2))
    throw e
  }
}
