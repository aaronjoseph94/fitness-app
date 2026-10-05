// Owns: what each editable setting is (pure) — label, unit, whether it is a rail (edits need confirmation), help copy
// in GLOSSARY terms — and how a typed value is checked: the SettingsPatch schema, plus floor ≤ ceiling against the
// value already stored.
import { SettingsPatch, type Settings, type Weekday } from '@fitness/shared/schemas'
import { formatNumber } from '../../../components'

export type NumberKey =
  | 'calorie_floor'
  | 'calorie_ceiling'
  | 'protein_min_g'
  | 'fat_min_g'
  | 'fasts_per_month'
  | 'fast_hours'
  | 'fibre_target_g'
  | 'water_target_ml'
  | 'scan_interval_days'

export interface NumberField {
  key: NumberKey
  label: string
  unit: string
  /** A rail (GLOSSARY): set with the doctor and dietitian; editing asks for confirmation. */
  rail: boolean
  help: string
}

export const RAIL_FIELDS: readonly NumberField[] = [
  { key: 'calorie_floor', label: 'Calorie floor', unit: 'kcal', rail: true, help: 'Nothing is ever proposed below this.' },
  { key: 'calorie_ceiling', label: 'Calorie ceiling', unit: 'kcal', rail: true, help: 'Review proposals stay at or under this.' },
  { key: 'protein_min_g', label: 'Protein minimum', unit: 'g', rail: true, help: 'Protein is never proposed below this.' },
  { key: 'fat_min_g', label: 'Fat minimum', unit: 'g', rail: true, help: 'Fat is never proposed below this.' },
  { key: 'fasts_per_month', label: 'Fasts per month', unit: '', rail: true, help: 'Planned fasts, on dates you pick.' },
  { key: 'fast_hours', label: 'Fast length', unit: 'h', rail: true, help: 'How long a planned fast lasts.' },
]

export const TARGET_FIELDS: readonly NumberField[] = [
  { key: 'fibre_target_g', label: 'Fibre', unit: 'g', rail: false, help: 'Daily fibre target.' },
  { key: 'water_target_ml', label: 'Water', unit: 'ml', rail: false, help: 'Daily water target; fast days add to it.' },
]

export const SCAN_FIELD: NumberField = {
  key: 'scan_interval_days',
  label: 'Scan interval',
  unit: 'days',
  rail: false,
  help: 'How often an Evolt scan comes due (28 days = 4 weeks).',
}

export function formatValue(field: NumberField, value: number): string {
  return field.unit ? `${formatNumber(value)} ${field.unit}` : formatNumber(value)
}

/** Parse what was typed: digits with optional grouping commas or spaces. Null when it is not a whole number. */
export function parseWhole(text: string): number | null {
  const cleaned = text.replace(/[\s,]/g, '')
  if (!/^\d+$/.test(cleaned)) return null
  return Number(cleaned)
}

/** Why `value` can't be saved for `field`, or null when it can. */
export function checkValue(field: NumberField, value: number | null, current: Settings): string | null {
  if (value === null) return 'Enter a whole number.'
  if (field.key === 'calorie_floor' && value > current.calorie_ceiling)
    return `The floor can't be above the ceiling (${formatNumber(current.calorie_ceiling)} kcal).`
  if (field.key === 'calorie_ceiling' && value < current.calorie_floor)
    return `The ceiling can't be below the floor (${formatNumber(current.calorie_floor)} kcal).`
  const parsed = SettingsPatch.safeParse({ [field.key]: value })
  if (parsed.success) return null
  const issue = parsed.error.issues[0]
  if (issue?.code === 'too_small') return `At least ${formatNumber(Number(issue.minimum))}${field.unit ? ` ${field.unit}` : ''}.`
  if (issue?.code === 'too_big') return `At most ${formatNumber(Number(issue.maximum))}${field.unit ? ` ${field.unit}` : ''}.`
  return issue?.message ?? 'That value is not allowed.'
}

export const WEEKDAYS: readonly { key: Weekday; short: string; long: string }[] = [
  { key: 'mon', short: 'Mon', long: 'Monday' },
  { key: 'tue', short: 'Tue', long: 'Tuesday' },
  { key: 'wed', short: 'Wed', long: 'Wednesday' },
  { key: 'thu', short: 'Thu', long: 'Thursday' },
  { key: 'fri', short: 'Fri', long: 'Friday' },
  { key: 'sat', short: 'Sat', long: 'Saturday' },
  { key: 'sun', short: 'Sun', long: 'Sunday' },
]

/** "Mon, Tue, Wed, Thu" in week order; "None" when empty. */
export function formatDays(days: readonly Weekday[]): string {
  const list = WEEKDAYS.filter((d) => days.includes(d.key)).map((d) => d.short)
  return list.length ? list.join(', ') : 'None'
}
