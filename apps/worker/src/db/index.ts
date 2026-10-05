// Owns: the database entry point — createDb(d1) and the table/view objects with their inferred row types.
// D1 rules: never db.transaction() (D1 throws); write one change as a single db.batch([...]); conditional writes in SQL
// (ON CONFLICT / WHERE NOT EXISTS); at most 100 bound parameters per statement; delete child rows explicitly (no cascades).
import type { InferInsertModel, InferSelectModel, Table } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'

export * from './schema'

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

export type Db = ReturnType<typeof createDb>

/** A selected row, e.g. Row<typeof weight_logs>. */
export type Row<T extends Table> = InferSelectModel<T>
/** An insertable row (defaults optional), e.g. NewRow<typeof meals>. */
export type NewRow<T extends Table> = InferInsertModel<T>
/** One v_day row: a date's targets and logged totals. */
export type DayRow = typeof schema.v_day.$inferSelect
