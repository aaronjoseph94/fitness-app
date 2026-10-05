// Owns: the confirm form's model — fields grouped like the Evolt sheet (body composition, water, fat, segments,
// energy, scores) with units and precision, the form state built from a draft (extraction), a confirmed record
// (editing) or nothing (manual entry), each field's extraction confidence, and the ScanRecord the form confirms.
import { ScanRecord, type ScanConditions, type ScanDraft, type ScanSegment } from '@fitness/shared/schemas'
import { clockOf, dateOf, instantAt } from '../../quick-log'
import { SEGMENTS } from './series'
import { parseNumber } from '../../../components'

export type NumericKey =
  | 'height_cm'
  | 'age'
  | 'weight_kg'
  | 'lean_body_mass_kg'
  | 'skeletal_muscle_mass_kg'
  | 'protein_kg'
  | 'mineral_kg'
  | 'total_body_water_kg'
  | 'icf_kg'
  | 'ecf_kg'
  | 'body_fat_mass_kg'
  | 'body_fat_pct'
  | 'subcutaneous_fat_kg'
  | 'visceral_fat_kg'
  | 'visceral_fat_area_cm2'
  | 'visceral_fat_level'
  | 'bmr_kcal'
  | 'tee_kcal'
  | 'waist_hip_ratio'
  | 'bio_age'
  | 'bwi_score'

export interface FieldSpec {
  key: NumericKey
  label: string
  unit: string
  integer?: boolean
}

export interface FieldGroup {
  title: string
  fields: FieldSpec[]
}

const kg = (key: NumericKey, label: string): FieldSpec => ({ key, label, unit: 'kg' })

/** The sheet's sections, in its order. Segments and conditions are their own blocks. */
export const GROUPS: FieldGroup[] = [
  {
    title: 'Body composition',
    fields: [kg('weight_kg', 'Weight'), kg('lean_body_mass_kg', 'Lean body mass'), kg('skeletal_muscle_mass_kg', 'Skeletal muscle mass'), kg('protein_kg', 'Protein'), kg('mineral_kg', 'Mineral')],
  },
  { title: 'Body water', fields: [kg('total_body_water_kg', 'Total body water'), kg('icf_kg', 'Intracellular fluid'), kg('ecf_kg', 'Extracellular fluid')] },
  {
    title: 'Fat',
    fields: [
      kg('body_fat_mass_kg', 'Body fat mass'),
      { key: 'body_fat_pct', label: 'Body fat', unit: '%' },
      kg('subcutaneous_fat_kg', 'Subcutaneous fat'),
      kg('visceral_fat_kg', 'Visceral fat mass'),
      { key: 'visceral_fat_area_cm2', label: 'Visceral fat area', unit: 'cm²' },
      { key: 'visceral_fat_level', label: 'Visceral fat level', unit: 'level', integer: true },
    ],
  },
  {
    title: 'Energy',
    fields: [
      { key: 'bmr_kcal', label: 'BMR', unit: 'kcal', integer: true },
      { key: 'tee_kcal', label: 'TEE', unit: 'kcal', integer: true },
    ],
  },
  {
    title: 'Scores',
    fields: [
      { key: 'waist_hip_ratio', label: 'Waist-to-hip ratio', unit: 'WHR' },
      { key: 'bio_age', label: 'Bio age', unit: 'years', integer: true },
      { key: 'bwi_score', label: 'BWI score', unit: '/ 10' },
    ],
  },
]

export const PROFILE_FIELDS: FieldSpec[] = [
  { key: 'height_cm', label: 'Height', unit: 'cm' },
  { key: 'age', label: 'Age', unit: 'years', integer: true },
]

export type TriState = 'yes' | 'no' | 'unknown'

export interface ScanForm {
  date: string
  time: string
  sex: 'male' | 'female'
  source_units: 'lb' | 'kg'
  values: Record<NumericKey, string>
  segments: Record<ScanSegment, { lean_kg: string; fat_kg: string }>
  conditions: {
    time_of_day: ScanConditions['time_of_day']
    fasted: TriState
    hours_since_training: string
    hydration: string
    matches_baseline: TriState
    notes: string
  }
}

type Readable = Partial<Record<NumericKey, number | null>> & {
  scanned_at?: string | null
  sex?: 'male' | 'female' | null
  segments?: Partial<Record<ScanSegment, { lean_kg: number | null; fat_kg: number | null }>>
}

const text = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v))
const tri = (v: boolean | null | undefined): TriState => (v === true ? 'yes' : v === false ? 'no' : 'unknown')
const fromTri = (v: TriState) => (v === 'yes' ? true : v === 'no' ? false : null)
const ALL_KEYS = [...PROFILE_FIELDS, ...GROUPS.flatMap((g) => g.fields)].map((f) => f.key)

/** Time of day from a wall time: before 12:00 morning, before 17:00 afternoon, else evening. */
export function timeOfDay(time: string): ScanConditions['time_of_day'] {
  return time < '12:00' ? 'morning' : time < '17:00' ? 'afternoon' : 'evening'
}

/**
 * Form state from what we have: a confirmed record (edit), else the extraction draft, else blanks with the profile
 * fallback (manual entry). Values stay as text so every one can be edited freely.
 */
export function formFrom(input: {
  record?: ScanRecord | null
  draft?: ScanDraft | null
  fallback: { date: string; time: string; height_cm?: number | null; age?: number | null; sex?: 'male' | 'female' | null }
}): ScanForm {
  const source: Readable = input.record ?? input.draft ?? {}
  const at = source.scanned_at ?? null
  const time = at ? clockOf(at) : input.fallback.time
  const values = Object.fromEntries(ALL_KEYS.map((k) => [k, text(source[k])])) as Record<NumericKey, string>
  if (!values.height_cm && input.fallback.height_cm) values.height_cm = String(input.fallback.height_cm)
  if (!values.age && input.fallback.age) values.age = String(input.fallback.age)
  const c = input.record?.conditions
  return {
    date: at ? dateOf(at) : input.fallback.date,
    time,
    sex: source.sex ?? input.fallback.sex ?? 'male',
    source_units: input.record?.source_units ?? input.draft?.source_units ?? 'lb',
    values,
    segments: Object.fromEntries(
      SEGMENTS.map((s) => [s, { lean_kg: text(source.segments?.[s]?.lean_kg), fat_kg: text(source.segments?.[s]?.fat_kg) }]),
    ) as ScanForm['segments'],
    conditions: {
      time_of_day: c?.time_of_day ?? timeOfDay(time),
      fasted: tri(c?.fasted),
      hours_since_training: text(c?.hours_since_training),
      hydration: c?.hydration ?? '',
      matches_baseline: tri(c?.matches_baseline),
      notes: c?.notes ?? '',
    },
  }
}

/** The extraction's confidence (0–1) for a field ("weight_kg", "segments.torso.fat_kg"), when it gave one. */
export function confidenceOf(draft: ScanDraft | null | undefined, field: string): number | null {
  return draft?.confidence.find((c) => c.field === field)?.confidence ?? null
}

/** Below this, a value is highlighted for checking. */
export const LOW_CONFIDENCE = 0.7

export type FormErrors = Partial<Record<string, string>>

/** The record the form confirms, or the fields to fix (keyed like the form: "weight_kg", "segments.torso.fat_kg"). */
export function recordFrom(form: ScanForm): { record: ScanRecord; errors: null } | { record: null; errors: FormErrors } {
  const errors: FormErrors = {}
  const num = (key: string, raw: string, integer = false): number | null => {
    const n = parseNumber(raw)
    if (n === null) errors[key] = 'Required'
    else if (integer && !Number.isInteger(n)) errors[key] = 'Whole number'
    return n
  }
  const specs = [...PROFILE_FIELDS, ...GROUPS.flatMap((g) => g.fields)]
  const values = Object.fromEntries(specs.map((f) => [f.key, num(f.key, form.values[f.key], f.integer)]))
  const segments = Object.fromEntries(
    SEGMENTS.map((s) => [s, { lean_kg: num(`segments.${s}.lean_kg`, form.segments[s].lean_kg), fat_kg: num(`segments.${s}.fat_kg`, form.segments[s].fat_kg) }]),
  )
  const hours = form.conditions.hours_since_training.trim() === '' ? null : parseNumber(form.conditions.hours_since_training)
  if (form.conditions.hours_since_training.trim() !== '' && (hours === null || hours < 0)) errors['conditions.hours_since_training'] = 'Hours, 0 or more'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) errors.date = 'Pick the scan date'
  if (!/^\d{2}:\d{2}$/.test(form.time)) errors.time = 'Pick the scan time'
  if (Object.keys(errors).length > 0) return { record: null, errors }

  const parsed = ScanRecord.safeParse({
    scanned_at: instantAt(form.date, form.time),
    source: 'evolt360',
    source_units: form.source_units,
    sex: form.sex,
    ...values,
    segments,
    conditions: {
      time_of_day: form.conditions.time_of_day,
      fasted: fromTri(form.conditions.fasted),
      hours_since_training: hours,
      hydration: form.conditions.hydration.trim() || null,
      matches_baseline: fromTri(form.conditions.matches_baseline),
      notes: form.conditions.notes.trim() || null,
    },
  })
  if (parsed.success) return { record: parsed.data, errors: null }
  for (const issue of parsed.error.issues) errors[issue.path.join('.')] ??= issue.message
  return { record: null, errors }
}
