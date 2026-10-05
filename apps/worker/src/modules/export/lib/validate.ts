// Owns: what an import page must satisfy before it is written, beyond the column names. A restore writes rows verbatim
// (SQL upserts, no module in between), so every cell of every table is checked against its column first (a number in a
// number column, 0/1 in a boolean one, JSON text in a JSON one, text in a text one and inside its enum, NULL only where
// the column allows it, every NOT NULL column without an SQL default present); a malformed cell would otherwise be
// stored and break every read of it. Then the rows that hold the rails (settings) and the targets everything else is
// computed from (plan_versions, daily_targets) are decoded from their export cells (JSON text, 0/1 booleans) and parsed
// with their shared Zod schemas; settings also need calorie_floor ≤ calorie_ceiling; profile and settings take exactly
// one row. One bad row refuses the whole page (422 invalid_rows, naming the table, the row and the column), so nothing
// half-valid is stored.
import { DailyTargets, PlanVersion, Settings, type ExportRow, type ExportTable } from '@fitness/shared/schemas'
import * as z from 'zod'
import { HttpError } from '../../../lib/http-error'
import type { ColumnRule, TableSpec } from './tables'

/**
 * Settings as a restore may write them: every rail present and in bounds (DailyKcal 800–5,000 for the kcal rails), the
 * other columns checked when present, and the floor never above the ceiling.
 */
const SettingsRow = Settings.omit({ id: true, created_at: true, updated_at: true })
  .partial()
  .required({ calorie_floor: true, calorie_ceiling: true, protein_min_g: true, fat_min_g: true, fasts_per_month: true, fast_hours: true })
  .refine((s) => s.calorie_floor <= s.calorie_ceiling, { message: 'calorie_floor must not exceed calorie_ceiling', path: ['calorie_floor'] })

/** A plan version's stored columns: the targets always, the rest when present. */
const PlanVersionRow = PlanVersion.pick({ version: true, active: true, created_by: true, reason: true, diff: true, targets: true, forecast: true })
  .partial()
  .required({ targets: true })

/** One materialised day: its date and every target value always, the links and flags when present. */
const DailyTargetsRow = DailyTargets.partial().required({
  date: true,
  kcal: true,
  protein_g: true,
  carbs_g: true,
  fat_g: true,
  fibre_g: true,
  water_ml: true,
  steps: true,
})

const VALIDATORS: Partial<Record<ExportTable, z.ZodType>> = {
  settings: SettingsRow,
  plan_versions: PlanVersionRow,
  daily_targets: DailyTargetsRow,
}

/** `index` is the row's place in the page (0-based; shown 1-based). */
const invalid = (spec: TableSpec, index: number, row: ExportRow, why: string) =>
  new HttpError(422, 'invalid_rows', `${spec.name} row ${index + 1} (id ${String(row.id)}): ${why}`)

const shown = (cell: ExportRow[string]) => JSON.stringify(cell).slice(0, 40)

/** Why `cell` can't be stored in a column with `rule`, or null when it can. A cell missing from the row is NULL. */
function cellProblem(rule: ColumnRule, cell: ExportRow[string] | undefined): string | null {
  if (cell === null || cell === undefined) return rule.nullable ? null : 'is empty, but the column is NOT NULL'
  switch (rule.kind) {
    case 'number':
      return typeof cell === 'number' ? null : `must be a number, not ${shown(cell)}`
    case 'boolean':
      return cell === 0 || cell === 1 ? null : `must be 0 or 1, not ${shown(cell)}`
    case 'json':
      if (typeof cell !== 'string') return `must be JSON text, not ${shown(cell)}`
      try {
        JSON.parse(cell)
        return null
      } catch {
        return 'is not valid JSON'
      }
    case 'text':
      if (typeof cell !== 'string') return `must be text, not ${shown(cell)}`
      return rule.values && !rule.values.has(cell) ? `must be one of ${[...rule.values].join(', ')}, not ${shown(cell)}` : null
  }
}

/**
 * Throw 422 unless every row's cells fit their columns. `columns` are the columns the page carries (the upsert writes
 * exactly those, NULL where a row lacks one); a NOT NULL column without an SQL default must be among them.
 */
function checkCells(spec: TableSpec, columns: readonly string[], rows: readonly ExportRow[]): void {
  const carried = new Set(columns)
  for (const [column, rule] of spec.rules) {
    if (rule.required && !carried.has(column))
      throw new HttpError(422, 'invalid_rows', `${spec.name}: every row needs ${column}, and this page has none`)
  }
  const checks = columns.map((column) => [column, spec.rules.get(column)!] as const)
  for (const [index, row] of rows.entries()) {
    for (const [column, rule] of checks) {
      const problem = cellProblem(rule, row[column])
      if (problem) throw invalid(spec, index, row, `${column} ${problem}`)
    }
  }
}

/** A row as the app reads it: JSON columns parsed, 0/1 columns as booleans (anything else is left for the schema). */
function decode(spec: TableSpec, index: number, row: ExportRow): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [column, cell] of Object.entries(row)) {
    if (spec.jsonColumns.has(column) && typeof cell === 'string') {
      try {
        out[column] = JSON.parse(cell) as unknown
      } catch {
        throw invalid(spec, index, row, `${column} is not JSON`)
      }
    } else if (spec.boolColumns.has(column) && (cell === 0 || cell === 1)) out[column] = cell === 1
    else out[column] = cell
  }
  return out
}

/**
 * Throw 422 invalid_rows (naming the table, the row, the column and the rule) unless every cell fits its column, every
 * row of a schema-validated table parses, and a single-row table (profile, settings: one set of rails) gets exactly
 * one row — the page replaces the stored row, so a second one would leave two sets of rails for `limit 1` reads to
 * pick from. `columns` are the columns the page carries (from checkRows).
 */
export function validateRows(spec: TableSpec, columns: readonly string[], rows: readonly ExportRow[]): void {
  if (spec.singleRow && rows.length > 1)
    throw new HttpError(422, 'invalid_rows', `${spec.name} holds exactly one row; this page has ${rows.length}`)
  checkCells(spec, columns, rows)
  const schema = VALIDATORS[spec.name]
  if (!schema) return
  for (const [index, row] of rows.entries()) {
    const parsed = schema.safeParse(decode(spec, index, row))
    if (!parsed.success) throw invalid(spec, index, row, z.prettifyError(parsed.error))
  }
}
