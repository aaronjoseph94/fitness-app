// Owns: primitive Zod schemas reused everywhere (ids, local dates, UTC instants, units, enums from SPEC §2 and §5, row metadata).
import * as z from 'zod'

/** UUID text primary key. Create bodies carry a client-generated one so queued offline writes are idempotent. */
export const Id = z.uuid()
export type Id = z.infer<typeof Id>

/** A day in Aaron's timezone (America/Edmonton), e.g. "2026-10-04". */
export const LocalDate = z.iso.date()
export type LocalDate = z.infer<typeof LocalDate>

/**
 * An instant. Accepts any ISO offset ("2026-09-26T10:13:00-06:00" or "…Z") and normalises to the stored UTC form
 * "YYYY-MM-DDTHH:MM:SS.sssZ" (→ "2026-09-26T16:13:00.000Z"), so normalised instants compare correctly as strings.
 */
export const Instant = z.iso.datetime({ offset: true }).overwrite((v) => new Date(v).toISOString())
export type Instant = z.infer<typeof Instant>

/** A wall-clock time in Edmonton, "HH:MM" (reminder times). */
export const LocalTime = z.iso.time({ precision: -1 })
export type LocalTime = z.infer<typeof LocalTime>

/** ISO week key, e.g. "2026-W41". */
export const IsoWeek = z.string().regex(/^\d{4}-W\d{2}$/)
export type IsoWeek = z.infer<typeof IsoWeek>

/** Inclusive range of local days; `from` ≤ `to` (ISO dates compare as strings). */
export const DateRange = z
  .object({ from: LocalDate, to: LocalDate })
  .refine((r) => r.from <= r.to, { message: '`from` must be on or before `to`', path: ['to'] })
export type DateRange = z.infer<typeof DateRange>

// ── Units (SPEC §2: kg, cm, ml, kcal, g) ────────────────────────────────────────────────────────────────────────

/** Mass in kilograms (body weight, tissue mass, loads). */
export const Kg = z.number().nonnegative().max(1000)
/** Length in centimetres. */
export const Cm = z.number().positive().max(300)
/** Volume in millilitres. */
export const Ml = z.number().int().nonnegative().max(20_000)
/** Energy in kilocalories. */
export const Kcal = z.number().nonnegative().max(20_000)
/** Mass of food or a nutrient in grams. */
export const Grams = z.number().nonnegative().max(10_000)
/** Whole minutes. */
export const Minutes = z.number().int().nonnegative()
/** A share or confidence from 0 to 1. */
export const Fraction = z.number().min(0).max(1)
/** A percentage from 0 to 100. */
export const Percent = z.number().min(0).max(100)
/** A whole count (steps, sets). */
export const Count = z.number().int().nonnegative()

/**
 * A non-negative integer in a query string. Callers pass a number (or digits); the server receives digits and gets a
 * number back. (z.coerce alone would type the caller's input as `unknown`.)
 */
export const QueryInt = z.union([z.number().int(), z.string().regex(/^\d+$/)]).pipe(z.coerce.number<string | number>().int().nonnegative())

// ── Rows and responses ─────────────────────────────────────────────────────────────────────────────────────────

/** Fields every stored entity carries (SPEC §5: UUID id, created_at/updated_at). Extend it for entity schemas. */
export const Row = z.object({ id: Id, created_at: Instant, updated_at: Instant })
export type Row = z.infer<typeof Row>

/** Response of a write that returns nothing else (deletes, imports of files). */
export const Ok = z.object({ ok: z.literal(true) })
export type Ok = z.infer<typeof Ok>

// ── Domain enums shared by several areas ───────────────────────────────────────────────────────────────────────

export const Actor = z.enum(['user', 'ai', 'mcp'])
export type Actor = z.infer<typeof Actor>

export const MealSlot = z.enum(['breakfast', 'lunch', 'dinner', 'snack'])
export type MealSlot = z.infer<typeof MealSlot>

export const MeasurementSite = z.enum([
  'neck',
  'chest',
  'waist_navel',
  'hips',
  'left_arm',
  'right_arm',
  'left_thigh',
  'right_thigh',
])
export type MeasurementSite = z.infer<typeof MeasurementSite>

/** The 17 muscle groups of free-exercise-db; the muscle map uses the same keys. */
export const Muscle = z.enum([
  'abdominals',
  'abductors',
  'adductors',
  'biceps',
  'calves',
  'chest',
  'forearms',
  'glutes',
  'hamstrings',
  'lats',
  'lower back',
  'middle back',
  'neck',
  'quadriceps',
  'shoulders',
  'traps',
  'triceps',
])
export type Muscle = z.infer<typeof Muscle>

export const Weekday = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
export type Weekday = z.infer<typeof Weekday>

/**
 * An object with one `schema` value per weekday, mon…sun. Written out as explicit keys (not z.record) so the JSON
 * Schema an LLM sees lists every day.
 */
export function byWeekday<T extends z.ZodType>(schema: T) {
  return z.object({ mon: schema, tue: schema, wed: schema, thu: schema, fri: schema, sat: schema, sun: schema })
}
