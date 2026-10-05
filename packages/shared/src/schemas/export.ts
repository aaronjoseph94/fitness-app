// Owns: export, import (restore) and the monthly backup — the table list in restore order, paged per-table JSON (the
// browser builds the zip), the manifest of files to include, the archive's full.json, and the import pages that
// restore a fresh instance (gated by a restore id, idempotent upserts by id).
import * as z from 'zod'
import { Count, Id, Instant } from './common'
import { FileKey, SignedFile } from './files'

/**
 * Every D1 table in an export (SPEC §5 plus app_notes), in restore order: parents before children, so a restore that
 * walks this list never breaks a foreign key. System tables (cron_runs, provider_usage, foods_fts) are not exported.
 */
export const ExportTable = z.enum([
  'profile',
  'settings',
  'weight_logs',
  'measurements',
  'water_logs',
  'sleep_logs',
  'step_logs',
  'fast_logs',
  'foods',
  'favorites',
  'meals',
  'meal_items',
  'meal_photos',
  'plan_versions',
  'weekly_reviews',
  'week_plans',
  'daily_targets',
  'scans',
  'scan_segments',
  'milestones',
  'exercises',
  'equipment_profile',
  'exercise_exclusions',
  'workout_templates',
  'template_exercises',
  'workout_sessions',
  'session_sets',
  'progress_photos',
  'ai_jobs',
  'ai_events',
  'chat_messages',
  'push_subscriptions',
  'app_notes',
])
export type ExportTable = z.infer<typeof ExportTable>

/** A D1 cell as stored: JSON columns stay JSON text, booleans are 0/1. */
export const ExportCell = z.union([z.string(), z.number(), z.null()])
export const ExportRow = z.record(z.string(), ExportCell)
export type ExportRow = z.infer<typeof ExportRow>

/** Most rows one export page or import page carries. */
export const EXPORT_PAGE_ROWS = 500

/** One table in the manifest with its row count. */
export const ExportTableCount = z.object({ table: ExportTable, rows: Count })
export type ExportTableCount = z.infer<typeof ExportTableCount>

/** Response of GET /api/export: what to fetch — every table (restore order, with row counts) and a signed URL per stored file. */
export const ExportManifest = z.object({
  exported_at: Instant,
  tables: z.array(ExportTableCount),
  /** Meal photos, progress photos, scan sheets and report PDFs the tables reference; links last a few hours. */
  files: z.array(SignedFile),
})
export type ExportManifest = z.infer<typeof ExportManifest>

/** Query of GET /api/export/tables: one page of one table in id order; pass `next_cursor` back until it is null. */
export const ExportTableQuery = z.object({ table: ExportTable, cursor: z.string().max(200).optional() })
export type ExportTableQuery = z.infer<typeof ExportTableQuery>

/** One page: at most EXPORT_PAGE_ROWS rows (fewer for tables with large rows), ordered by id. */
export const ExportPage = z.object({
  table: ExportTable,
  rows: z.array(ExportRow),
  next_cursor: z.string().nullable(),
})
export type ExportPage = z.infer<typeof ExportPage>

/** Name of the all-tables file inside the export zip. */
export const EXPORT_FULL_JSON = 'full.json'

/**
 * full.json inside the export zip: every table's rows plus where each stored file sits in the zip (`files/<key>`).
 * Tables may be missing (an older export); a restore walks ExportTable order and skips them.
 */
export const ExportArchive = z.object({
  format: z.literal('fitness-export'),
  version: z.literal(1),
  exported_at: Instant,
  tables: z.partialRecord(ExportTable, z.array(ExportRow)),
  files: z.array(z.object({ key: FileKey, path: z.string().min(1) })),
})
export type ExportArchive = z.infer<typeof ExportArchive>

/** A boolean in a query string: callers pass true/false, the server receives "true"/"false". */
const QueryBool = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => v === true || v === 'true')

/**
 * Which restore a page belongs to. The first page of a restore is refused (409 not_fresh) unless the instance holds
 * nothing logged beyond the seed, or `overwrite` is set; later pages and files with the same `restore_id` pass.
 */
const RestoreGate = { restore_id: Id, overwrite: QueryBool.default(false) }

/** Body of POST /api/import: one page of one table's rows from an export, upserted by id (replaying a page is harmless). */
export const ImportPage = z.object({
  ...RestoreGate,
  table: ExportTable,
  rows: z.array(ExportRow).min(1).max(EXPORT_PAGE_ROWS),
})
export type ImportPage = z.infer<typeof ImportPage>

export const ImportResult = z.object({ table: ExportTable, upserted: Count })
export type ImportResult = z.infer<typeof ImportResult>

/** Query of POST /api/import/files (body: the file as Binary): restores one stored file under its original key. */
export const ImportFileQuery = z.object({ ...RestoreGate, key: FileKey })
export type ImportFileQuery = z.infer<typeof ImportFileQuery>
