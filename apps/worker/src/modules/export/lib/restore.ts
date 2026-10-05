// Owns: writing one import page — the restore gate (fresh instance, or overwrite, or a restore already under way),
// the column check, and the single D1 batch that upserts the rows by id. The batch defers foreign keys to its end,
// removes stored rows that would collide on another unique key (a day's targets materialised under another id),
// writes rows leaving a partial unique index first, and upserts with ON CONFLICT(id) DO UPDATE (not REPLACE, so the
// foods_fts triggers stay in step). Rows travel as one JSON parameter (?1) and are unpacked in SQL with json_each.
// Statements go straight to D1's batch: Drizzle's D1 batch cannot run raw SQL that has bound parameters.
import type { ExportRow, ImportPage } from '@fitness/shared/schemas'
import { sql } from 'drizzle-orm'
import type { Deps } from '../../../lib/deps'
import { badRequest, HttpError } from '../../../lib/http-error'
import { eventInsert } from '../../events'
import { ident, tableSpec, type TableSpec } from './tables'

/** cron_runs kind that marks a restore under way (period_key = restore_id): later pages of it pass the gate. */
const RESTORE_KIND = 'restore'

/**
 * Tables a fresh instance has no rows in (the seed never writes them; only logging does). weight_logs is checked
 * separately: the seed writes the 2026-09-26 baseline weigh-in.
 */
const LOGGED_TABLES = [
  'meals',
  'water_logs',
  'sleep_logs',
  'step_logs',
  'fast_logs',
  'measurements',
  'workout_sessions',
  'progress_photos',
  'chat_messages',
] as const

type Gate = Pick<ImportPage, 'restore_id' | 'overwrite'>

/** One SQL statement for D1's batch. */
export interface Statement {
  sql: string
  params: unknown[]
}

/** Run `statements` as one D1 batch (one implicit transaction: all or nothing). */
export async function runBatch(deps: Deps, statements: Statement[]): Promise<void> {
  if (statements.length === 0) return
  const d1 = deps.env.DB
  await d1.batch(statements.map((s) => d1.prepare(s.sql).bind(...s.params)))
}

/**
 * Throws 409 not_fresh unless this restore already started, the instance is fresh (nothing logged beyond the seeded
 * weigh-in), or `overwrite` is set. Returns the statement that marks the restore as started (empty when it is).
 */
export async function restoreGate(deps: Deps, gate: Gate): Promise<Statement[]> {
  const logged = LOGGED_TABLES.map((t) => `EXISTS (SELECT 1 FROM ${ident(t)})`).join(' OR ')
  const state = await deps.db.get<{ started: number; weigh_ins: number; logged: number }>(sql`
    SELECT EXISTS (SELECT 1 FROM cron_runs WHERE kind = ${RESTORE_KIND} AND period_key = ${gate.restore_id}) AS started,
      (SELECT count(*) FROM weight_logs) AS weigh_ins,
      (${sql.raw(logged)}) AS logged`)
  if (state?.started) return []
  const fresh = !state?.logged && (state?.weigh_ins ?? 0) <= 1
  if (!fresh && !gate.overwrite)
    throw new HttpError(
      409,
      'not_fresh',
      'This instance already has logged data. Restore is meant for a fresh instance; turn on overwrite to merge the export over what is here.',
    )
  const now = deps.now().toISOString()
  return [
    {
      sql: `INSERT INTO cron_runs (id, kind, period_key, ran_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4, ?4)
        ON CONFLICT (kind, period_key) DO NOTHING`,
      params: [crypto.randomUUID(), RESTORE_KIND, gate.restore_id, now],
    },
  ]
}

/** 400 when a row has no text id or carries a column the table does not have (an export from another schema). */
export function checkRows(spec: TableSpec, rows: ExportRow[]): string[] {
  const known = new Set(spec.columns)
  const present = new Set<string>()
  for (const row of rows) {
    if (typeof row.id !== 'string' || row.id === '')
      throw badRequest(`Every ${spec.name} row needs a text id`)
    for (const key in row) present.add(key)
  }
  const unknown = [...present].filter((k) => !known.has(k))
  if (unknown.length > 0)
    throw badRequest(`${spec.name} has no column ${unknown.join(', ')}; is this export from another version?`)
  return spec.columns.filter((c) => present.has(c))
}

const field = (c: string) => `json_extract(value, ${`'$.${JSON.stringify(c)}'`})`

/** The statements that write `rows` (JSON text `json`, bound as ?1) into `spec` with the given columns, in batch order. */
export function upsertStatements(deps: Deps, spec: TableSpec, columns: string[], json: string): Statement[] {
  const table = ident(spec.name)
  const ids = `(SELECT ${field('id')} FROM json_each(?1))`
  const statements: Statement[] = [{ sql: 'PRAGMA defer_foreign_keys = on', params: [] }]

  if (spec.singleRow) statements.push({ sql: `DELETE FROM ${table} WHERE id NOT IN ${ids}`, params: [json] })
  for (const key of spec.uniqueKeys) {
    if (!key.every((c) => columns.includes(c))) continue
    const target = key.length === 1 ? ident(key[0]!) : `(${key.map(ident).join(', ')})`
    statements.push({
      sql: `DELETE FROM ${table} WHERE id NOT IN ${ids} AND ${target} IN (SELECT ${key.map(field).join(', ')} FROM json_each(?1))`,
      params: [json],
    })
  }

  const updates = columns.filter((c) => c !== 'id').map((c) => `${ident(c)} = excluded.${ident(c)}`)
  const order = spec.restoreOrder ? ` ORDER BY ${spec.restoreOrder}` : ''
  // `WHERE true` keeps SQLite from reading ON CONFLICT as a join constraint (the documented upsert ambiguity).
  statements.push({
    sql: `INSERT INTO ${table} (${columns.map(ident).join(', ')})
      SELECT ${columns.map(field).join(', ')} FROM json_each(?1) WHERE true${order}
      ON CONFLICT (id) DO ${updates.length > 0 ? `UPDATE SET ${updates.join(', ')}` : 'NOTHING'}`,
    params: [json],
  })

  if (spec.name === 'settings') {
    const event = eventInsert(deps, {
      kind: 'change',
      summary: 'Settings and rails restored from an export',
      body: { entity: 'settings', changes: [] },
    })
    statements.push(event.statement.toSQL())
  }
  return statements
}

/** Restore one page. Only actor 'user' (Aaron in the app) may restore the settings rails. */
export async function importPage(deps: Deps, page: ImportPage): Promise<number> {
  if (page.table === 'settings' && deps.actor !== 'user')
    throw new HttpError(403, 'rails_locked', 'Only Aaron restores the settings rails')
  const spec = tableSpec(page.table)
  const columns = checkRows(spec, page.rows)
  const gate = await restoreGate(deps, page)
  await runBatch(deps, [...gate, ...upsertStatements(deps, spec, columns, JSON.stringify(page.rows))])
  return page.rows.length
}
