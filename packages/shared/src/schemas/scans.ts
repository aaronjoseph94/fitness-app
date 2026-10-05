// Owns: Evolt 360 scans — the confirmed scan record (exactly the SPEC §2 seed-record shape), the scan_extract LLM
// output (sheet units, per-field confidence), the kg draft awaiting confirmation, the upload/confirm bodies, and the
// scan as the API returns it (extraction job state; engine comparison, flags and debrief once confirmed).
import * as z from 'zod'
import { MilestoneKind } from './body'
import { Count, Fraction, Id, Instant, Kcal, Kg, LocalDate, Percent, Row } from './common'
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
  /** Aaron's answer to "same conditions as the baseline?" (null = not said). A "no" is called out in the analysis. */
  matches_baseline: z.boolean().nullable().default(null),
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

/** A whole-body metric of a scan (the numeric seed-record fields). */
export const ScanMetricField = ScanMetrics.keyof()
export type ScanMetricField = z.infer<typeof ScanMetricField>

/** The lean-loss guard (SPEC §3): ok, lean_loss (lean > 25 % of the weight lost), or hydration (matched by water). */
export const LeanLossGuard = z.enum(['ok', 'lean_loss', 'hydration'])
export type LeanLossGuard = z.infer<typeof LeanLossGuard>

const SegmentChange = z.object({ lean_kg: z.number(), fat_kg: z.number() })

/** The engine's comparison of a scan with an earlier one (`compareScans`): signed changes, newer − earlier. */
export const ScanChange = z.object({
  /** The earlier scan. */
  scan_id: Id,
  date: LocalDate,
  days: z.number().int(),
  deltas: z.partialRecord(ScanMetricField, z.number()),
  segments: z.partialRecord(ScanSegment, SegmentChange),
  fat_vs_lean: z.object({ weight_kg: z.number(), fat_kg: z.number(), lean_kg: z.number(), water_kg: z.number() }),
  /** lean lost / weight lost when weight was lost; else null. */
  lean_share_of_loss: z.number().nullable(),
  lean_loss: LeanLossGuard,
  /** Composition milestones this scan meets and the earlier one did not. */
  milestones_reached: z.array(z.object({ kind: MilestoneKind, label: z.string(), target_value: z.number() })),
})
export type ScanChange = z.infer<typeof ScanChange>

/** A call-out of the scan analysis (the scan_analysis job output reuses it). */
export const ScanFlag = z.object({
  code: z.enum(['lean_loss', 'water_shift', 'visceral_up', 'fat_gain', 'conditions_mismatch', 'other']),
  message: z.string().max(300),
})
export type ScanFlag = z.infer<typeof ScanFlag>

/** A milestone the analysis re-anchored to this scan (reached_on null = no longer met). */
export const ScanMilestoneUpdate = z.object({ milestone_id: Id, kind: MilestoneKind, label: z.string(), reached_on: LocalDate.nullable() })
export type ScanMilestoneUpdate = z.infer<typeof ScanMilestoneUpdate>

/**
 * A confirmed scan's analysis. The comparisons and flags are the engine's, computed on read; the narrative, the
 * milestone re-anchoring and the proposals come from the scan_analysis job (`status`).
 */
export const ScanAnalysis = z.object({
  vs_previous: ScanChange.nullable(),
  vs_baseline: ScanChange.nullable(),
  flags: z.array(ScanFlag),
  status: z.enum(['none', 'pending', 'done', 'failed']),
  job_id: Id.nullable(),
  narrative: z.string().nullable(),
  /** 'ai': the Clerk wrote the narrative; 'engine': the plain engine summary (no LLM answered). */
  narrative_by: z.enum(['ai', 'engine']).nullable(),
  /** Pending plan proposals (protein, steps, …) the analysis made; each passed the guards. */
  proposal_ids: z.array(Id),
  milestone_updates: z.array(ScanMilestoneUpdate),
})
export type ScanAnalysis = z.infer<typeof ScanAnalysis>

/** The sheet-reading job of an unconfirmed scan: while queued or running, poll it; after an error, offer manual entry. */
export const ScanExtraction = z.object({
  job_id: Id,
  status: z.enum(['queued', 'running', 'done', 'failed']),
  attempts: z.number().int().nonnegative(),
  error: z.string().nullable(),
})
export type ScanExtraction = z.infer<typeof ScanExtraction>

/** A scan as the API returns it: the sheet, the pending draft, and the confirmed record once Aaron confirms. */
export const Scan = Row.extend({
  /** Local date of the scan (the upload date until a record with scanned_at is confirmed). */
  date: LocalDate,
  sheet_url: FileUrl.nullable(),
  confirmed: z.boolean(),
  extracted: ScanDraft.nullable(),
  record: ScanRecord.nullable(),
  /** Unconfirmed scans: the latest scan_extract job (null when none ran). */
  extraction: ScanExtraction.nullable(),
  /** Confirmed scans: the comparison with the previous scan and the baseline, and the debrief. */
  analysis: ScanAnalysis.nullable(),
})
export type Scan = z.infer<typeof Scan>

/**
 * Query of POST /api/scans (body: the sheet as an image; the browser renders a PDF and masks the name field first —
 * a raw PDF would carry the name in its text layer to the vision LLM, so it is not accepted).
 */
export const ScanUploadQuery = z.object({
  id: Id,
  content_type: z.enum(['image/png', 'image/jpeg', 'image/webp']),
})
export type ScanUploadQuery = z.infer<typeof ScanUploadQuery>

/** Response of POST /api/scans: the new scan and the scan_extract job reading it. */
export const ScanUploaded = z.object({ scan: Scan, job_id: Id })
export type ScanUploaded = z.infer<typeof ScanUploaded>

/**
 * GET /api/scans/schedule: when the next scan is due — the date the coach or an applied week plan set (after the last
 * confirmed scan), else every interval_days after the last confirmed scan. The reminder and the nightly note use it too.
 */
export const ScanSchedule = z.object({
  /** Local date of the last confirmed scan (null before the first). */
  last_scan_date: LocalDate.nullable(),
  interval_days: z.number().int().positive(),
  /** last_scan_date + interval_days (null before the first scan). */
  interval_due: LocalDate.nullable(),
  /** The scheduled date, when one is set after the last scan. */
  scheduled: LocalDate.nullable(),
  /** When the next scan is due: the scheduled date, else the interval date. */
  due: LocalDate.nullable(),
  source: z.enum(['scheduled', 'interval', 'none']),
  /** Local date of the newest uploaded sheet still waiting to be confirmed, if any. */
  awaiting_confirmation: LocalDate.nullable(),
})
export type ScanSchedule = z.infer<typeof ScanSchedule>

/** Body of PATCH /api/scans/:id: the full record after Aaron's edits (or manual entry). Saving it confirms the scan. */
export const ScanPatch = z.object({ record: ScanRecord })
export type ScanPatch = z.infer<typeof ScanPatch>
