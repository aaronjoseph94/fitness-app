// Owns: export and import — the table list, paged per-table JSON (the browser builds the zip), the manifest of
// files to include, and the import pages that restore a fresh instance.
import * as z from 'zod'
import { Count, Instant } from './common'
import { FileKey, SignedFile } from './files'

/** Every D1 table in an export (SPEC §5 plus app_notes), in restore order: parents before children. */
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

/** A D1 cell as stored (JSON columns stay JSON text). */
export const ExportCell = z.union([z.string(), z.number(), z.null()])
export const ExportRow = z.record(z.string(), ExportCell)
export type ExportRow = z.infer<typeof ExportRow>

/** Response of GET /api/export: what to fetch — every table, and a signed URL per stored file. */
export const ExportManifest = z.object({
  exported_at: Instant,
  tables: z.array(ExportTable),
  files: z.array(SignedFile),
})
export type ExportManifest = z.infer<typeof ExportManifest>

/** Query of GET /api/export/tables: one page of one table; pass `next_cursor` back until it is null. */
export const ExportTableQuery = z.object({ table: ExportTable, cursor: z.string().max(200).optional() })
export type ExportTableQuery = z.infer<typeof ExportTableQuery>

export const ExportPage = z.object({ table: ExportTable, rows: z.array(ExportRow), next_cursor: z.string().nullable() })
export type ExportPage = z.infer<typeof ExportPage>

/** Body of POST /api/import: one page of one table's rows from an export, upserted by id. */
export const ImportPage = z.object({ table: ExportTable, rows: z.array(ExportRow).min(1).max(500) })
export type ImportPage = z.infer<typeof ImportPage>

export const ImportResult = z.object({ table: ExportTable, upserted: Count })
export type ImportResult = z.infer<typeof ImportResult>

/** Query of POST /api/import/files (body: the file as Binary): restores one stored file under its original key. */
export const ImportFileQuery = z.object({ key: FileKey })
export type ImportFileQuery = z.infer<typeof ImportFileQuery>
