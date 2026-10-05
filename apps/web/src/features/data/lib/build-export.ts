// Owns: "Export everything" — building the export zip in the browser (the Worker never zips: free-plan CPU). Reads the
// manifest, pages every table from /api/export/tables, then streams the zip with client-zip: README.txt, one CSV per
// table under tables/, every photo, scan sheet and report PDF under files/<key> (fetched from its signed link), and
// full.json last, listing only the files that made it in. full.json is what "Restore from export" reads. An expired
// Access session stops the export (and raises "Sign in again") instead of listing every file as missing.
import { endpoints } from '@fitness/shared/api'
import {
  EXPORT_FULL_JSON,
  type ExportArchive,
  type ExportRow,
  type ExportTable,
} from '@fitness/shared/schemas'
import { downloadZip } from 'client-zip'
import { call, fetchFile, isApiError } from '../../../api'
import { toCsv } from './csv'

export interface ExportProgress {
  phase: 'tables' | 'files' | 'packing'
  done: number
  total: number
  label: string
}

export interface BuiltExport {
  blob: Blob
  fileName: string
  rows: number
  tables: number
  files: number
  /** Keys whose file could not be fetched (gone from storage or the link failed); listed in the README. */
  missing: string[]
}

const README = (exportedAt: string, missing: string[]) =>
  [
    `Fitness tracker export, ${exportedAt} (UTC).`,
    '',
    'full.json   every table, exactly as stored; "Restore from export" in Settings reads this file',
    'tables/     one CSV per table (JSON columns as JSON text, booleans 0/1, instants in UTC)',
    'files/      meal photos, progress photos, scan sheets and report PDFs under their storage keys',
    '',
    'Units: kg, cm, ml, kcal, g. Local dates are America/Edmonton.',
    ...(missing.length > 0 ? ['', `Not included (could not be fetched): ${missing.join(', ')}`] : []),
    '',
  ].join('\r\n')

/** Build the whole export. Throws ApiError when a table cannot be read; a missing file is skipped and reported. */
export async function buildExport(
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal,
): Promise<BuiltExport> {
  const manifest = await call(endpoints.export.manifest, {}, { signal })
  const totalRows = manifest.tables.reduce((n, t) => n + t.rows, 0)
  const tables: Partial<Record<ExportTable, ExportRow[]>> = {}
  let fetched = 0
  onProgress({ phase: 'tables', done: 0, total: totalRows, label: 'Reading tables' })
  for (const { table, rows: count } of manifest.tables) {
    const rows: ExportRow[] = []
    let cursor: string | null = count > 0 ? '' : null
    while (cursor !== null) {
      const page = await call(
        endpoints.export.table,
        { query: cursor ? { table, cursor } : { table } },
        { signal },
      )
      rows.push(...page.rows)
      fetched += page.rows.length
      cursor = page.next_cursor
      onProgress({
        phase: 'tables',
        done: Math.min(fetched, totalRows),
        total: totalRows,
        label: `Reading ${table.replaceAll('_', ' ')}`,
      })
    }
    tables[table] = rows
  }

  const lastModified = new Date(manifest.exported_at)
  const included: ExportArchive['files'] = []
  const missing: string[] = []
  const files = manifest.files
  /** Why the file loop stopped the zip: rethrown as is (the zip stream may wrap it). */
  let stopped: unknown = null

  async function* entries() {
    for (const [table, rows] of Object.entries(tables)) {
      if (rows.length > 0) yield { name: `tables/${table}.csv`, input: toCsv(rows), lastModified }
    }
    for (const [i, file] of files.entries()) {
      signal.throwIfAborted()
      onProgress({ phase: 'files', done: i, total: files.length, label: 'Adding photos, sheets and reports' })
      const path = `files/${file.key}`
      try {
        const bytes = await fetchFile(file.url, { signal })
        yield { name: path, input: new Uint8Array(bytes), lastModified }
        included.push({ key: file.key, path })
      } catch (error) {
        if (signal.aborted) throw error
        if (isApiError(error) && error.kind === 'auth-expired') throw (stopped = error)
        missing.push(file.key)
      }
    }
    onProgress({
      phase: 'packing',
      done: files.length,
      total: Math.max(files.length, 1),
      label: 'Packing the zip',
    })
    const archive: ExportArchive = {
      format: 'fitness-export',
      version: 1,
      exported_at: manifest.exported_at,
      tables,
      files: included,
    }
    yield { name: 'README.txt', input: README(manifest.exported_at, missing), lastModified }
    yield { name: EXPORT_FULL_JSON, input: JSON.stringify(archive), lastModified }
  }

  const blob = await downloadZip(entries(), { buffersAreUTF8: true })
    .blob()
    .catch((error: unknown) => {
      throw stopped ?? error
    })
  return {
    blob: new Blob([blob], { type: 'application/zip' }),
    fileName: `fitness-export-${manifest.exported_at.slice(0, 10)}.zip`,
    rows: fetched,
    tables: manifest.tables.filter((t) => t.rows > 0).length,
    files: included.length,
    missing,
  }
}
