// Owns: Evolt 360 scans — the confirmed scan record (exactly the SPEC §2 seed-record shape), the scan_extract LLM
// output (sheet units, per-field confidence), the kg draft awaiting confirmation, and the upload/confirm bodies.
import * as z from 'zod'
import { Count, Fraction, Id, Instant, Kcal, Kg, Percent, Row } from './common'
import { FileUrl } from './files'
import { Sex } from './profile-settings'

export const ScanSource = z.enum(['evolt360'])
export type ScanSource = z.infer<typeof ScanSource>

/** Mass unit printed on the sheet (Aaron's sheets are lb; 1 lb = 0.4536 kg). */
export const MassUnit = z.enum(['lb', 'kg'])
export type MassUnit = z.infer<typeof MassUnit>

export const ScanSegment = z.enum(['left_arm', 'right_arm', 'torso', 'left_leg', 'right_leg'])
export type ScanSegment = z.infer<typeof ScanSegment>

const SegmentMass = z.object({ lean_kg: Kg, fat_kg: Kg })

/** Segmental lean and fat mass, one entry per ScanSegment. */
export const ScanSegments = z.object({
  left_arm: SegmentMass,
  right_arm: SegmentMass,
  torso: SegmentMass,
  left_leg: SegmentMass,
  right_leg: SegmentMass,
})
export type ScanSegments = z.infer<typeof ScanSegments>

/** Conditions recorded with each scan (baseline: morning, fasted, no training the day before, normal hydration). */
export const ScanConditions = z.object({
  time_of_day: z.enum(['morning', 'afternoon', 'evening']),
  fasted: z.boolean().nullable(),
  hours_since_training: z.number().nonnegative().nullable(),
  hydration: z.string().max(200).nullable().default(null),
  notes: z.string().max(1000).nullable(),
})
export type ScanConditions = z.infer<typeof ScanConditions>

/** Whole-body metrics of one scan, in kg / % / cm² / kcal. */
export const ScanMetrics = z.object({
  weight_kg: Kg.positive(),
  lean_body_mass_kg: Kg,
  skeletal_muscle_mass_kg: Kg,
  protein_kg: Kg,
  mineral_kg: Kg,
  total_body_water_kg: Kg,
  icf_kg: Kg,
  ecf_kg: Kg,
  body_fat_mass_kg: Kg,
  body_fat_pct: Percent,
  subcutaneous_fat_kg: Kg,
  visceral_fat_kg: Kg,
  visceral_fat_area_cm2: z.number().nonnegative(),
  visceral_fat_level: Count.max(100),
  bmr_kcal: Kcal,
  tee_kcal: Kcal,
  waist_hip_ratio: z.number().positive().max(3),
  bio_age: Count.max(150),
  bwi_score: z.number().min(0).max(10),
})
export type ScanMetrics = z.infer<typeof ScanMetrics>

/** A confirmed scan: exactly the SPEC §2 seed-record shape. Mass values are kg; `source_units` is what the sheet printed. */
export const ScanRecord = z.object({
  scanned_at: Instant,
  source: ScanSource,
  source_units: MassUnit,
  height_cm: z.number().positive().max(300),
  age: Count.max(150),
  sex: Sex,
  ...ScanMetrics.shape,
  segments: ScanSegments,
  conditions: ScanConditions,
})
export type ScanRecord = z.infer<typeof ScanRecord>

/** `{ k: S[k] }` → `{ k: S[k] | null }`: a value the sheet reader could not see is null, never guessed. */
function nullableFields<S extends z.ZodRawShape>(shape: S) {
  return Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, z.nullable(v)])) as {
    [K in keyof S]: z.ZodNullable<S[K]>
  }
}

const SegmentMassReading = z.object(nullableFields(SegmentMass.shape))

/** Confidence (0–1) for one extracted field, by key: "weight_kg", "segments.torso.fat_kg". */
export const FieldConfidence = z.object({ field: z.string().min(1), confidence: Fraction })
export type FieldConfidence = z.infer<typeof FieldConfidence>

/** What can be read off a sheet: the seed-record fields, each nullable, plus per-field confidence. No conditions. */
const ScanReading = z.object({
  scanned_at: Instant.nullable(),
  height_cm: z.number().positive().max(300).nullable(),
  age: Count.max(150).nullable(),
  sex: Sex.nullable(),
  ...nullableFields(ScanMetrics.shape),
  segments: z.object({
    left_arm: SegmentMassReading,
    right_arm: SegmentMassReading,
    torso: SegmentMassReading,
    left_leg: SegmentMassReading,
    right_leg: SegmentMassReading,
  }),
  confidence: z.array(FieldConfidence),
})

/**
 * scan_extract job output (LLM, vision). Mass fields are as printed, in `units` — despite their `_kg` names, which
 * keep the seed-record shape. The Worker converts to kg (× 0.4536 when units = "lb") to make a ScanDraft.
 */
export const ScanExtractOutput = ScanReading.extend({ units: MassUnit })
export type ScanExtractOutput = z.infer<typeof ScanExtractOutput>

/** The extraction converted to kg, stored as `scans.extracted` and shown in the confirm form with its confidences. */
export const ScanDraft = ScanReading.extend({ source_units: MassUnit })
export type ScanDraft = z.infer<typeof ScanDraft>

/** A scan as the API returns it: the sheet, the pending draft, and the confirmed record once Aaron confirms. */
export const Scan = Row.extend({
  sheet_url: FileUrl.nullable(),
  confirmed: z.boolean(),
  extracted: ScanDraft.nullable(),
  record: ScanRecord.nullable(),
})
export type Scan = z.infer<typeof Scan>

/** Query of POST /api/scans (body: the sheet file as Binary; the name field is masked in the browser first). */
export const ScanUploadQuery = z.object({
  id: Id,
  content_type: z.enum(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
})
export type ScanUploadQuery = z.infer<typeof ScanUploadQuery>

/** Response of POST /api/scans: the new scan and the scan_extract job reading it. */
export const ScanUploaded = z.object({ scan: Scan, job_id: Id })
export type ScanUploaded = z.infer<typeof ScanUploaded>

/** Body of PATCH /api/scans/:id: the full record after Aaron's edits (or manual entry). Saving it confirms the scan. */
export const ScanPatch = z.object({ record: ScanRecord })
export type ScanPatch = z.infer<typeof ScanPatch>
