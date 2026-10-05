// Owns: what the export module knows about each exported table, derived once per isolate from the Drizzle schema —
// its column names (the only identifiers ever spliced into export/import SQL), its unique keys besides id, how many
// rows one page carries, and the restore order inside a page for tables with a partial unique index.
import { ExportTable, EXPORT_PAGE_ROWS } from '@fitness/shared/schemas'
import { getTableColumns, is, type Table } from 'drizzle-orm'
import { getTableConfig, SQLiteColumn, type SQLiteTable } from 'drizzle-orm/sqlite-core'
import * as db from '../../../db'

const TABLES: Record<ExportTable, SQLiteTable> = {
  profile: db.profile,
  settings: db.settings,
  weight_logs: db.weight_logs,
  measurements: db.measurements,
  water_logs: db.water_logs,
  sleep_logs: db.sleep_logs,
  step_logs: db.step_logs,
  fast_logs: db.fast_logs,
  foods: db.foods,
  favorites: db.favorites,
  meals: db.meals,
  meal_items: db.meal_items,
  meal_photos: db.meal_photos,
  plan_versions: db.plan_versions,
  weekly_reviews: db.weekly_reviews,
  week_plans: db.week_plans,
  daily_targets: db.daily_targets,
  scans: db.scans,
  scan_segments: db.scan_segments,
  milestones: db.milestones,
  exercises: db.exercises,
  equipment_profile: db.equipment_profile,
  exercise_exclusions: db.exercise_exclusions,
  workout_templates: db.workout_templates,
  template_exercises: db.template_exercises,
  workout_sessions: db.workout_sessions,
  session_sets: db.session_sets,
  progress_photos: db.progress_photos,
  ai_jobs: db.ai_jobs,
  ai_events: db.ai_events,
  chat_messages: db.chat_messages,
  push_subscriptions: db.push_subscriptions,
  app_notes: db.app_notes,
}

/**
 * Rows per page for tables whose rows carry long text or JSON (instructions, raw food records, job payloads, plans,
 * narratives). Smaller pages keep one page's JSON well under D1's 2 MB value limit; a page that still overflows is
 * halved and retried (lib/page.ts).
 */
const PAGE_ROWS: Partial<Record<ExportTable, number>> = {
  foods: 200,
  exercises: 200,
  plan_versions: 200,
  weekly_reviews: 50,
  week_plans: 100,
  scans: 200,
  workout_templates: 200,
  workout_sessions: 200,
  ai_jobs: 100,
  ai_events: 200,
  chat_messages: 200,
}

/**
 * Inside one restore page, rows that leave a partial unique index are written before rows that enter it (exactly one
 * active plan version; one active week plan per week), so swapping the active row never collides. SQL over json_each.
 */
const RESTORE_ORDER: Partial<Record<ExportTable, string>> = {
  plan_versions: `json_extract(value, '$.active')`,
  week_plans: `json_extract(value, '$.status') = 'active'`,
}

/** One-row tables: a restore leaves exactly the export's row (a seeded row under another id is removed). */
const SINGLE_ROW: ReadonlySet<ExportTable> = new Set(['profile', 'settings'])

export interface TableSpec {
  name: ExportTable
  /** Column names in schema order; `id` is one of them. */
  columns: readonly string[]
  /** Full (non-partial) unique keys other than id, as column lists. */
  uniqueKeys: readonly (readonly string[])[]
  pageRows: number
  restoreOrder: string | null
  singleRow: boolean
}

const specs = new Map<ExportTable, TableSpec>()

/** The spec for `name`, built from the Drizzle schema on first use and cached for the isolate. */
export function tableSpec(name: ExportTable): TableSpec {
  let spec = specs.get(name)
  if (!spec) {
    const table = TABLES[name]
    const columns = Object.values(getTableColumns(table as Table)).map((c) => c.name)
    const uniqueKeys = getTableConfig(table)
      .indexes.filter((i) => i.config.unique && !i.config.where)
      .map((i) => i.config.columns.filter((c): c is SQLiteColumn => is(c, SQLiteColumn)).map((c) => c.name))
      .filter((key) => key.length > 0 && !(key.length === 1 && key[0] === 'id'))
    spec = {
      name,
      columns,
      uniqueKeys,
      pageRows: PAGE_ROWS[name] ?? EXPORT_PAGE_ROWS,
      restoreOrder: RESTORE_ORDER[name] ?? null,
      singleRow: SINGLE_ROW.has(name),
    }
    specs.set(name, spec)
  }
  return spec
}

/** Every exported table in restore order (parents before children). */
export const RESTORE_TABLES: readonly ExportTable[] = ExportTable.options

/** A column name as a quoted SQL identifier (names come from the schema, never from a request). */
export const ident = (name: string) => `"${name.replaceAll('"', '""')}"`
