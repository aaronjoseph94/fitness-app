// Owns: Apple Watch inputs — sleep and step logs, the manual forms, the iOS Shortcut webhook body (SPEC §8 route 3)
// and the file-import rows/mapping (route 2). One sleep row per night (date = wake date), one step row per date.
import * as z from 'zod'
import { Count, Id, Instant, Kcal, LocalDate, Minutes, Row } from './common'

export const HealthSource = z.enum(['manual', 'import', 'watch_webhook'])
export type HealthSource = z.infer<typeof HealthSource>

const AsleepMin = Minutes.max(24 * 60)
const Steps = Count.max(200_000)

/** Apple Health sleep stages in minutes; any may be missing. */
export const SleepStages = z
  .object({ awake_min: Minutes, rem_min: Minutes, core_min: Minutes, deep_min: Minutes })
  .partial()
export type SleepStages = z.infer<typeof SleepStages>

export const SleepLog = Row.extend({
  /** The wake date. */
  date: LocalDate,
  in_bed_at: Instant.nullable(),
  woke_at: Instant.nullable(),
  asleep_min: AsleepMin,
  source: HealthSource,
  stages: SleepStages.nullable(),
})
export type SleepLog = z.infer<typeof SleepLog>

/**
 * Body of POST /api/sleep (manual form): hours asleep, or both in-bed and wake times (asleep = woke − in bed).
 * Upserts by date. Normalised instants compare as strings, so in_bed_at < woke_at is a string check.
 */
export const SleepLogCreate = z
  .object({
    id: Id,
    date: LocalDate,
    in_bed_at: Instant.optional(),
    woke_at: Instant.optional(),
    asleep_min: AsleepMin.optional(),
    stages: SleepStages.optional(),
  })
  .refine((b) => b.asleep_min !== undefined || (b.in_bed_at !== undefined && b.woke_at !== undefined), {
    message: 'Give hours asleep, or both in-bed and wake times',
    path: ['asleep_min'],
  })
  .refine((b) => b.in_bed_at === undefined || b.woke_at === undefined || b.in_bed_at < b.woke_at, {
    message: 'Wake time must be after in-bed time',
    path: ['woke_at'],
  })
export type SleepLogCreate = z.infer<typeof SleepLogCreate>

export const StepLog = Row.extend({
  date: LocalDate,
  steps: Steps,
  active_kcal: Kcal.nullable(),
  source: HealthSource,
})
export type StepLog = z.infer<typeof StepLog>

/** Body of POST /api/steps (manual form). Upserts by date. */
export const StepLogCreate = z.object({ id: Id, date: LocalDate, steps: Steps, active_kcal: Kcal.optional() })
export type StepLogCreate = z.infer<typeof StepLogCreate>

/** A number a Shortcut may send as text or with decimals ("8432", 411.6): coerced and rounded to a whole number. */
const ShortcutCount = z.coerce.number().nonnegative().overwrite(Math.round).int()

/**
 * Body of POST /api/ingest/health (Bearer HEALTH_WEBHOOK_TOKEN), sent each morning by an iOS Shortcut with
 * yesterday's Health data. Idempotent by date. `sleep` is absent when the watch was not worn.
 */
export const HealthIngest = z.object({
  date: LocalDate,
  steps: ShortcutCount.pipe(Steps),
  active_kcal: ShortcutCount.optional(),
  sleep: z
    .object({ in_bed_at: Instant, woke_at: Instant, asleep_min: ShortcutCount.pipe(AsleepMin) })
    .refine((s) => s.in_bed_at < s.woke_at, { message: 'Wake time must be after in-bed time', path: ['woke_at'] })
    .refine((s) => s.asleep_min <= (Date.parse(s.woke_at) - Date.parse(s.in_bed_at)) / 60_000, {
      message: 'Asleep longer than in bed',
      path: ['asleep_min'],
    })
    .nullable()
    .optional(),
})
export type HealthIngest = z.infer<typeof HealthIngest>

export const HealthIngestResult = z.object({ date: LocalDate, steps: StepLog, sleep: SleepLog.nullable() })
export type HealthIngestResult = z.infer<typeof HealthIngestResult>

/**
 * Which column of an export file (Health Auto Export CSV/JSON, Apple Health export) holds each value. The browser
 * parses the file and applies the mapping; the Worker only receives HealthImport rows.
 */
export const HealthImportMapping = z.object({
  date: z.string().min(1),
  steps: z.string().min(1).nullable(),
  active_kcal: z.string().min(1).nullable(),
  in_bed_at: z.string().min(1).nullable(),
  woke_at: z.string().min(1).nullable(),
  asleep: z.string().min(1).nullable(),
  asleep_unit: z.enum(['min', 'h']),
})
export type HealthImportMapping = z.infer<typeof HealthImportMapping>

/** One mapped day. Rows upsert by date; a row without sleep fields leaves that night's sleep alone. */
export const HealthImportRow = z.object({
  date: LocalDate,
  steps: Steps.optional(),
  active_kcal: Kcal.optional(),
  in_bed_at: Instant.optional(),
  woke_at: Instant.optional(),
  asleep_min: AsleepMin.optional(),
})
export type HealthImportRow = z.infer<typeof HealthImportRow>

/** Body of POST /api/imports/health — one page of mapped rows (the browser splits bigger files). */
export const HealthImport = z.object({ rows: z.array(HealthImportRow).min(1).max(1000) })
export type HealthImport = z.infer<typeof HealthImport>

export const HealthImportResult = z.object({ steps_upserted: Count, sleep_upserted: Count, skipped: Count })
export type HealthImportResult = z.infer<typeof HealthImportResult>
