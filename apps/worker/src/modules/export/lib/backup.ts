// Owns: the monthly backup — per-table JSON in R2 at reports/backup/<YYYY-MM>/<table>.json, ONE table per cron tick
// so every invocation stays inside the free plan's CPU budget (no zip, no photo copies). Progress is a cron_runs row
// per table (kind 'backup:<table>', period_key = the local month); a tick whose write fails leaves no row, so the
// next tick retries that table. The file is {"table","backed_up_at","rows":[…]} with rows exactly as the export pages.
import type { ExportTable } from '@fitness/shared/schemas'
import { and, eq, like } from 'drizzle-orm'
import { cron_runs } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { readPage } from './page'
import { RESTORE_TABLES, tableSpec } from './tables'

const KIND_PREFIX = 'backup:'
/** Rows per SQLite read while dumping one table (halved automatically for long rows). */
const BACKUP_READ_ROWS = 1000

export const backupKey = (month: string, table: ExportTable) => `reports/backup/${month}/${table}.json`

export interface BackupStep {
  /** The table written on this tick, or null when the month's backup was already complete. */
  table: ExportTable | null
  /** Tables backed up this month after this tick, and how many there are. */
  done: number
  of: number
}

/** Back up the next table of `month` that has none yet. */
export async function backupNextTable(deps: Deps, month: string): Promise<BackupStep> {
  const rows = await deps.db
    .select({ kind: cron_runs.kind })
    .from(cron_runs)
    .where(and(eq(cron_runs.period_key, month), like(cron_runs.kind, `${KIND_PREFIX}%`)))
  const done = new Set(rows.map((r) => r.kind.slice(KIND_PREFIX.length)))
  const of = RESTORE_TABLES.length
  const table = RESTORE_TABLES.find((t) => !done.has(t))
  if (!table) return { table: null, done: of, of }

  const spec = tableSpec(table)
  const parts: string[] = []
  let cursor = ''
  for (;;) {
    const page = await readPage(deps.db, spec, cursor, BACKUP_READ_ROWS)
    if (page.count > 0) parts.push(page.rows.slice(1, -1))
    if (!page.more || page.last === null) break
    cursor = page.last
  }
  const now = deps.now().toISOString()
  const body = `{"table":${JSON.stringify(table)},"backed_up_at":${JSON.stringify(now)},"rows":[${parts.join(',')}]}`
  await deps.env.FILES.put(backupKey(month, table), body, {
    httpMetadata: { contentType: 'application/json' },
  })
  await deps.db
    .insert(cron_runs)
    .values({
      kind: `${KIND_PREFIX}${table}`,
      period_key: month,
      ran_at: now,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoNothing({ target: [cron_runs.kind, cron_runs.period_key] })
  return { table, done: done.size + 1, of }
}
