// Owns: what each editable setting is (pure) — label, unit, whether it is a rail (edits need confirmation), help copy
// in GLOSSARY terms — and how a typed value is checked: the SettingsPatch schema, plus floor ≤ ceiling against the
// value already stored. Also what each editable profile field is, every one of them Aaron's to change, and the one-line
// summary of the reminder preferences the Settings list shows.
import { FAST_DAY_EXTRA_WATER_ML } from '@fitness/shared/engine'
import { ProfilePatch, SettingsPatch, type Profile, type ReminderPrefs, type Settings, type Weekday } from '@fitness/shared/schemas'
import { formatClockTime, formatNumber } from '../../../components'

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
  /** One line under the label (and in the editor); a field that names itself has none. */
  help?: string
}

export const RAIL_FIELDS: readonly NumberField[] = [
  { key: 'calorie_floor', label: 'Calorie floor', unit: 'kcal', rail: true, help: 'The AI never proposes a day below this' },
  { key: 'calorie_ceiling', label: 'Calorie ceiling for proposals', unit: 'kcal', rail: true, help: 'A proposed day never goes above this' },
  { key: 'protein_min_g', label: 'Protein minimum', unit: 'g', rail: true, help: 'A proposed day never goes below this' },
  { key: 'fat_min_g', label: 'Fat minimum', unit: 'g', rail: true },
  { key: 'fasts_per_month', label: 'Fasts per month', unit: '', rail: true, help: 'Planned fasts the week plan may place' },
  { key: 'fast_hours', label: 'Fast length', unit: 'h', rail: true, help: 'How long a planned fast lasts' },
]

export const TARGET_FIELDS: readonly NumberField[] = [
  { key: 'fibre_target_g', label: 'Fibre', unit: 'g', rail: false },
  { key: 'water_target_ml', label: 'Water', unit: 'ml', rail: false },
]

export const SCAN_FIELD: NumberField = {
  key: 'scan_interval_days',
  label: 'Scan interval',
  unit: 'days',
  rail: false,
  help: 'How often an Evolt scan comes due · same conditions each time',
}

/** The field's help line; water's names the fast-day target it implies (target + FAST_DAY_EXTRA_WATER_ML). */
export function helpFor(field: NumberField, settings: Settings): string | undefined {
  if (field.key === 'water_target_ml')
    return `Fast days go up to ${formatNumber(settings.water_target_ml + FAST_DAY_EXTRA_WATER_ML)} ml automatically`
  return field.help
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

/** "Weigh-in 7:00 AM · workout 4:30 PM on training days · water when behind pace": the reminders that are on. */
export function reminderSummary(reminders: ReminderPrefs): string {
  const parts: string[] = []
  if (reminders.weigh_in.enabled && reminders.weigh_in.time) parts.push(`weigh-in ${formatClockTime(reminders.weigh_in.time)}`)
  if (reminders.workout.enabled && reminders.workout.time) parts.push(`workout ${formatClockTime(reminders.workout.time)} on training days`)
  if (reminders.water.enabled) parts.push('water when behind pace')
  const line = parts.length ? parts.join(' · ') : 'weigh-in, workout and water reminders are off'
  return line.charAt(0).toUpperCase() + line.slice(1)
}

/** Every editable profile field: nothing on the Profile card is read-only. */
export type ProfileKey = keyof ProfilePatch

/** Which control edits a profile field: a numeric field, a date picker, a short choice, or free text. */
export type ProfileKind = 'number' | 'date' | 'choice' | 'text'

export interface ProfileField {
  key: ProfileKey
  label: string
  kind: ProfileKind
  /** Unit shown inside the number field, e.g. 'kg'. */
  unit?: string
  /** Decimal places (1 for a weight or a height, 0 for a whole number). */
  precision?: number
  /** Bounds for a friendly message before the schema has its say; mirrors SPEC §2 and `common.ts`. */
  min?: number
  max?: number
  /** The allowed values of a choice field. */
  options?: readonly { value: string; label: string }[]
  /** True when the field may be cleared (the schema's value is nullable); everything else must hold a value. */
  nullable?: boolean
  /** One line under the field in the dialog. */
  help?: string
}

/**
 * The profile, in reading order: what he is aiming for, where he started, then the body facts the engine reads.
 * `birth_date` is nullable in the schema (a profile may not have one), so it is the one field that may be cleared;
 * everything else must hold a value.
 */
export const PROFILE_FIELDS: readonly ProfileField[] = [
  { key: 'goal_weight_kg', label: 'Goal weight', kind: 'number', unit: 'kg', precision: 1, min: 30, max: 400 },
  { key: 'goal_date', label: 'Goal date', kind: 'date', help: 'The day the goal weight is due.' },
  { key: 'start_weight_kg', label: 'Start weight', kind: 'number', unit: 'kg', precision: 1, min: 30, max: 400 },
  { key: 'start_date', label: 'Start date', kind: 'date', help: 'The day the plan began, where progress is measured from.' },
  { key: 'height_cm', label: 'Height', kind: 'number', unit: 'cm', precision: 1, min: 50, max: 260 },
  {
    key: 'sex',
    label: 'Sex',
    kind: 'choice',
    options: [
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
    ],
  },
  { key: 'birth_date', label: 'Birth date', kind: 'date', nullable: true, help: 'Used for age, which sets the calorie estimates. Clear it to leave it out.' },
  { key: 'timezone', label: 'Time zone', kind: 'text', help: 'IANA zone, e.g. America/Edmonton. A day is this zone\u2019s day.' },
]

/** A profile value as the row shows it. */
export function formatProfileValue(field: ProfileField, profile: Profile): string {
  const value = profile[field.key]
  if (value === null || value === undefined || value === '') return 'Not set'
  if (field.kind === 'choice') return field.options?.find((o) => o.value === value)?.label ?? String(value)
  if (field.kind === 'number') return `${formatNumber(Number(value), field.precision ?? 0)}${field.unit ? ` ${field.unit}` : ''}`
  return String(value)
}

/** A decimal as typed (digits with an optional fraction); null when it is not one. */
export function parseDecimal(text: string): number | null {
  const cleaned = text.replace(/[\s,]/g, '')
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null
  return Number(cleaned)
}

/** What the dialog hands back for the field's kind: a number for a number field, trimmed text otherwise. */
export function parseProfileInput(field: ProfileField, text: string): string | number | null {
  if (field.kind === 'number') return parseDecimal(text)
  const trimmed = text.trim()
  return trimmed === '' ? null : trimmed
}

/** Why `value` can't be saved for `field`, or null when it can. The schema is the final authority. */
export function checkProfileValue(field: ProfileField, value: string | number | null): string | null {
  if (value === null) {
    if (field.nullable) return null
    return field.kind === 'number' ? 'Enter a number.' : 'This can\u2019t be empty.'
  }
  if (typeof value === 'number' && (value < (field.min ?? -Infinity) || value > (field.max ?? Infinity)))
    return `Enter a value between ${formatNumber(field.min ?? 0, field.precision ?? 0)} and ${formatNumber(field.max ?? 0, field.precision ?? 0)}${field.unit ? ` ${field.unit}` : ''}.`
  const parsed = ProfilePatch.safeParse({ [field.key]: value })
  if (parsed.success) return null
  const issue = parsed.error.issues[0]
  if (issue?.code === 'too_small') return `At least ${issue.minimum}${field.unit ? ` ${field.unit}` : ''}.`
  if (issue?.code === 'too_big') return `At most ${issue.maximum}${field.unit ? ` ${field.unit}` : ''}.`
  return issue?.message ?? 'That value is not allowed.'
}

/** The PATCH body for one profile field. An exhaustive switch, so a new field cannot be forgotten silently. */
export function profilePatch(field: ProfileField, value: string | number | null): ProfilePatch {
  switch (field.key) {
    case 'goal_weight_kg':
      return { goal_weight_kg: value as number }
    case 'start_weight_kg':
      return { start_weight_kg: value as number }
    case 'height_cm':
      return { height_cm: value as number }
    case 'goal_date':
      return { goal_date: value as string }
    case 'start_date':
      return { start_date: value as string }
    case 'birth_date':
      return { birth_date: value as string | null }
    case 'sex':
      return { sex: value as Profile['sex'] }
    case 'timezone':
      return { timezone: value as string }
  }
}
