// Owns: "Restore from export" — reading an export zip with fflate (full.json first, to show what will be restored),
// planning the restore as ordered steps (row pages per table in ExportTable order, so parents land before children;
// then each stored file), and running the steps from any index so a failed restore resumes where it stopped. Pages
// stay at most 500 rows and about 256 KB so each import request is cheap for the Worker.
import { endpoints } from '@fitness/shared/api'
import {
  EXPORT_FULL_JSON,
  EXPORT_PAGE_ROWS,
  ExportArchive,
  ExportTable,
  type ExportRow,
  type FileKey,
} from '@fitness/shared/schemas'
import { strFromU8, unzipSync } from 'fflate'
import { call } from '../../../api'

/** Soft cap on one import page's JSON size. */
const PAGE_BYTES = 256 * 1024

export interface OpenedExport {
  fileName: string
  exportedAt: string
  /** Tables with rows, in restore order. */
  tables: { table: ExportTable; rows: number }[]
  totalRows: number
  /** Stored files listed in full.json and present in the zip. */
  files: { key: FileKey; path: string }[]
  /** Files listed in full.json but missing from the zip. */
  missingFiles: number
  archive: ExportArchive
  zip: Uint8Array
}

/** Read the zip and its full.json. Throws an Error with a message fit for the screen. */
export async function openExport(file: File): Promise<OpenedExport> {
  const zip = new Uint8Array(await file.arrayBuffer())
  const names = new Set<string>()
  let unzipped: Record<string, Uint8Array>
  try {
    unzipped = unzipSync(zip, {
      filter: (entry) => {
        names.add(entry.name)
        return entry.name === EXPORT_FULL_JSON
      },
    })
  } catch {
    throw new Error('This file is not a zip this app can read.')
  }
  const json = unzipped[EXPORT_FULL_JSON]
  if (!json) throw new Error('This zip has no full.json. Pick a zip made by “Export everything”.')
  let parsed: unknown
  try {
    parsed = JSON.parse(strFromU8(json))
  } catch {
    throw new Error('full.json in this zip is not valid JSON.')
  }
  const result = ExportArchive.safeParse(parsed)
  if (!result.success)
    throw new Error('full.json does not look like an export from this app (or comes from a newer version).')
  const archive = result.data
  const tables = ExportTable.options.flatMap((table) => {
    const rows = archive.tables[table]?.length ?? 0
    return rows > 0 ? [{ table, rows }] : []
  })
  const files = archive.files.filter((f) => names.has(f.path))
  return {
    fileName: file.name,
    exportedAt: archive.exported_at,
    tables,
    totalRows: tables.reduce((n, t) => n + t.rows, 0),
    files,
    missingFiles: archive.files.length - files.length,
    archive,
    zip,
  }
}

export type RestoreStep =
  { kind: 'rows'; table: ExportTable; rows: ExportRow[] } | { kind: 'file'; key: FileKey; path: string }

/** Split every table into pages (≤ 500 rows, ≈ ≤ 256 KB) in restore order, then one step per file. */
export function planRestore(opened: OpenedExport): RestoreStep[] {
  const steps: RestoreStep[] = []
  for (const { table } of opened.tables) {
    let page: ExportRow[] = []
    let bytes = 0
    for (const row of opened.archive.tables[table] ?? []) {
      const size = JSON.stringify(row).length + 1
      if (page.length > 0 && (page.length === EXPORT_PAGE_ROWS || bytes + size > PAGE_BYTES)) {
        steps.push({ kind: 'rows', table, rows: page })
        page = []
        bytes = 0
      }
      page.push(row)
      bytes += size
    }
    if (page.length > 0) steps.push({ kind: 'rows', table, rows: page })
  }
  for (const file of opened.files) steps.push({ kind: 'file', ...file })
  return steps
}

export interface RestoreOptions {
  restoreId: string
  overwrite: boolean
  signal: AbortSignal
}

/** Thrown when a step fails: `index` is where to resume. */
export class RestoreStepError extends Error {
  constructor(
    readonly index: number,
    readonly step: RestoreStep,
    override readonly cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause))
  }
}

/** Run `steps` from `from`; `onStep(i)` after each one. Replaying a step is harmless (upserts by id, files by key). */
export async function runRestore(
  opened: OpenedExport,
  steps: readonly RestoreStep[],
  from: number,
  options: RestoreOptions,
  onStep: (done: number) => void,
): Promise<void> {
  for (let i = from; i < steps.length; i++) {
    const step = steps[i]!
    options.signal.throwIfAborted()
    try {
      if (step.kind === 'rows') {
        await call(
          endpoints.export.importTable,
          {
            body: {
              restore_id: options.restoreId,
              overwrite: options.overwrite,
              table: step.table,
              rows: step.rows,
            },
          },
          { signal: options.signal, timeoutMs: 60_000 },
        )
      } else {
        const bytes = unzipSync(opened.zip, { filter: (entry) => entry.name === step.path })[step.path]
        if (!bytes) throw new Error(`${step.path} is missing from the zip`)
        await call(
          endpoints.export.importFile,
          { query: { key: step.key, restore_id: options.restoreId, overwrite: options.overwrite }, body: ownBuffer(bytes) },
          { signal: options.signal, timeoutMs: 60_000 },
        )
      }
    } catch (error) {
      if (options.signal.aborted) throw error
      throw new RestoreStepError(i, step, error)
    }
    onStep(i + 1)
  }
}

/** The bytes as a standalone ArrayBuffer (an unzipped entry may be a view into a larger one). */
function ownBuffer(bytes: Uint8Array): ArrayBuffer {
  const whole = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength && bytes.buffer instanceof ArrayBuffer
  return whole ? (bytes.buffer as ArrayBuffer) : bytes.slice().buffer
}
