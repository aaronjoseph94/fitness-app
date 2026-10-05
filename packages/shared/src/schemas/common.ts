// Owns: primitive Zod schemas reused everywhere (ids, local dates, UTC instants, units, enums from SPEC §2 and §5).
import * as z from 'zod'

/** UUID text primary key. */
export const Id = z.uuid()
export type Id = z.infer<typeof Id>

/** A day in Aaron's timezone (America/Edmonton), e.g. "2026-10-04". */
export const LocalDate = z.iso.date()
export type LocalDate = z.infer<typeof LocalDate>

/** An instant, stored as UTC "YYYY-MM-DDTHH:MM:SS.sssZ"; the API accepts any offset and normalises to UTC. */
export const Instant = z.iso.datetime({ offset: true })
export type Instant = z.infer<typeof Instant>

/** ISO week key, e.g. "2026-W41". */
export const IsoWeek = z.string().regex(/^\d{4}-W\d{2}$/)
export type IsoWeek = z.infer<typeof IsoWeek>

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
