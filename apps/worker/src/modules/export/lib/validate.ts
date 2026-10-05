// Owns: what an import page must satisfy before it is written, beyond the column check — the settings rails and the
// plan's numbers. A restore writes rows verbatim (SQL upserts, no module in between), so the rows that hold the rails
// (settings) and the targets everything else is computed from (plan_versions, daily_targets) are decoded from their
// export cells (JSON text, 0/1 booleans) and parsed with their shared Zod schemas; settings also need
// calorie_floor ≤ calorie_ceiling. One bad row refuses the whole page (422), so nothing half-valid is stored.
import { DailyTargets, PlanVersion, Settings, type ExportRow, type ExportTable } from '@fitness/shared/schemas'
import * as z from 'zod'
import { HttpError } from '../../../lib/http-error'
import type { TableSpec } from './tables'

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

const invalid = (spec: TableSpec, row: ExportRow, why: string) =>
  new HttpError(422, 'invalid_rows', `${spec.name} row ${String(row.id)}: ${why}`)

/** A row as the app reads it: JSON columns parsed, 0/1 columns as booleans (anything else is left for the schema). */
function decode(spec: TableSpec, row: ExportRow): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [column, cell] of Object.entries(row)) {
    if (spec.jsonColumns.has(column) && typeof cell === 'string') {
      try {
        out[column] = JSON.parse(cell) as unknown
      } catch {
        throw invalid(spec, row, `${column} is not JSON`)
      }
    } else if (spec.boolColumns.has(column) && (cell === 0 || cell === 1)) out[column] = cell === 1
    else out[column] = cell
  }
  return out
}

/** Throw 422 invalid_rows (naming the row and the rule) unless every row of a validated table parses. */
export function validateRows(spec: TableSpec, rows: readonly ExportRow[]): void {
  const schema = VALIDATORS[spec.name]
  if (!schema) return
  for (const row of rows) {
    const parsed = schema.safeParse(decode(spec, row))
    if (!parsed.success) throw invalid(spec, row, z.prettifyError(parsed.error))
  }
}
