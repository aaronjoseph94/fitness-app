// Owns: the database entry point — createDb(d1), the table/view objects with their inferred row types, and the two
// helpers every module writes through (runBatch: one change, one batch; chunk: ≤ 100 bound parameters).
// D1 rules: never db.transaction() (D1 throws); write one change as a single db.batch([...]); conditional writes in SQL
// (ON CONFLICT / WHERE NOT EXISTS); at most 100 bound parameters per statement; delete child rows explicitly (no cascades).
import type { InferInsertModel, InferSelectModel, Table } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'

export * from './schema'

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

export type Db = ReturnType<typeof createDb>

/** Run one change's statements as a single db.batch (D1 has no transactions); nothing to run is a no-op. */
export async function runBatch(db: Db, statements: readonly BatchItem<'sqlite'>[]): Promise<void> {
  const [first, ...rest] = statements
  if (first) await db.batch([first, ...rest])
}

/** Split for ≤ 100 bound parameters per statement: rows per statement = floor(100 / columns); ids in IN (…): 90. */
export function chunk<T>(xs: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size))
  return out
}

/** A selected row, e.g. Row<typeof weight_logs>. */
export type Row<T extends Table> = InferSelectModel<T>
/** An insertable row (defaults optional), e.g. NewRow<typeof meals>. */
export type NewRow<T extends Table> = InferInsertModel<T>
/** One v_day row: a date's targets and logged totals. */
export type DayRow = typeof schema.v_day.$inferSelect
