// Owns: the export module's interface — export (manifest + paged per-table JSON; the browser builds the zip), import
// (restore a fresh instance page by page, plus its stored files) and the monthly per-table backup to R2.
// Interface:
//   exportManifest(deps)                 → ExportManifest   tables in restore order with row counts; signed file URLs
//   exportTablePage(deps, query)         → string           ExportPage as JSON text (≤ 500 rows, id order), built by SQLite
//   importTablePage(deps, page)          → ImportResult     upsert one page by id; 409 not_fresh, 403 rails_locked, 400,
//                                                           422 invalid_rows (settings / plan versions / daily targets
//                                                           that break their schemas or floor ≤ ceiling)
//   importFile(deps, query, body)        → Ok               put one file back under its key (same restore gate)
//   monthlyBackupStep(deps, 'YYYY-MM')   → BackupStep       one table per call to reports/backup/<month>/<table>.json
// Every call is cheap in Worker CPU: rows are serialised and unpacked by SQLite, never row by row in JS.
import type {
  ExportManifest,
  ExportTableQuery,
  ImportFileQuery,
  ImportPage,
  ImportResult,
  Ok,
} from '@fitness/shared/schemas'
import { sql } from 'drizzle-orm'
import type { Deps } from '../../lib/deps'
import { signFileUrl } from '../files'
import { backupNextTable, type BackupStep } from './lib/backup'
import { contentTypeOf, referencedKeys } from './lib/files'
import { readPage } from './lib/page'
import { importPage, restoreGate, runBatch } from './lib/restore'
import { ident, RESTORE_TABLES, tableSpec } from './lib/tables'

export type { BackupStep } from './lib/backup'
export { backupKey } from './lib/backup'

/** Signed links in a manifest outlive a slow export over a phone connection. */
const EXPORT_FILE_URL_TTL_SECONDS = 6 * 3600

/** One row, one column per table (scalar subqueries: D1 caps a compound SELECT at a handful of terms). */
const COUNTS_SQL = `SELECT ${RESTORE_TABLES.map((t) => `(SELECT count(*) FROM ${ident(t)}) AS ${ident(t)}`).join(', ')}`

/** GET /api/export. */
export async function exportManifest(deps: Deps): Promise<ExportManifest> {
  const now = deps.now()
  const [counts, keys] = await Promise.all([
    deps.db.get<Record<string, number>>(sql.raw(COUNTS_SQL)),
    referencedKeys(deps.db),
  ])
  const files = await Promise.all(
    keys.map((key) => signFileUrl(deps.env, key, EXPORT_FILE_URL_TTL_SECONDS, now)),
  )
  return {
    exported_at: now.toISOString(),
    tables: RESTORE_TABLES.map((table) => ({ table, rows: counts?.[table] ?? 0 })),
    files,
  }
}

/** GET /api/export/tables — the page as JSON text, ready to send (the Worker never touches the rows). */
export async function exportTablePage(deps: Deps, query: ExportTableQuery): Promise<string> {
  const page = await readPage(deps.db, tableSpec(query.table), query.cursor ?? '')
  const next = page.more ? page.last : null
  return `{"table":${JSON.stringify(query.table)},"rows":${page.rows},"next_cursor":${JSON.stringify(next)}}`
}

/**
 * POST /api/import — restore one page of one table, idempotently (upsert by id). The first page of a restore needs a
 * fresh instance (nothing logged beyond the seed) or `overwrite`; pages go in ExportTable order so foreign keys hold.
 */
export async function importTablePage(deps: Deps, page: ImportPage): Promise<ImportResult> {
  return { table: page.table, upserted: await importPage(deps, page) }
}

/** POST /api/import/files — put one exported file back under its key. */
export async function importFile(deps: Deps, query: ImportFileQuery, body: ArrayBuffer): Promise<Ok> {
  await runBatch(deps, await restoreGate(deps, query))
  await deps.env.FILES.put(query.key, body, { httpMetadata: { contentType: contentTypeOf(query.key) } })
  return { ok: true }
}

/** Cron hook: back up the next table of this local month (one per tick); a no-op once the month is complete. */
export function monthlyBackupStep(deps: Deps, month: string): Promise<BackupStep> {
  return backupNextTable(deps, month)
}
