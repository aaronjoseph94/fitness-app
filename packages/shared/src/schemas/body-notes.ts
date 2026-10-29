// Owns: body notes — how Aaron says his body feels on a day (a sore knee, a tweaked shoulder, low energy, a cold). A
// note on a muscle or joint steers generated workouts away from loading it; illness and low energy lower readiness.
// A note stays active until he resolves it, or 7 days after its date unless it is logged again.
import * as z from 'zod'
import { Actor, Id, Instant, LocalDate, Muscle } from './common'

/** Joints a note may name besides the 17 muscle keys. */
export const Joint = z.enum(['knee', 'hip', 'ankle', 'shoulder_joint', 'elbow', 'wrist', 'neck_joint', 'spine'])
export type Joint = z.infer<typeof Joint>

/** Where it is: a muscle key, a joint, or the whole body (energy, illness, mood). */
export const BodyArea = z.union([Muscle, Joint, z.literal('whole_body')])
export type BodyArea = z.infer<typeof BodyArea>

export const BodyNoteKind = z.enum(['pain', 'soreness', 'energy', 'illness', 'mood'])
export type BodyNoteKind = z.infer<typeof BodyNoteKind>

/** 1 mild (train around it), 2 moderate (keep it light), 3 severe (rest it). */
export const Severity = z.number().int().min(1).max(3)

/** Days a note stays active after its date unless it is logged again or resolved. */
export const BODY_NOTE_DAYS = 7

export const BodyNote = z.object({
  id: Id,
  date: LocalDate,
  area: BodyArea,
  kind: BodyNoteKind,
  severity: Severity,
  note: z.string().max(500),
  resolved_on: LocalDate.nullable(),
  actor: Actor,
  created_at: Instant,
  updated_at: Instant,
})
export type BodyNote = z.infer<typeof BodyNote>

/** Body of a new note (client id; replaying it returns the stored note). */
export const BodyNoteCreate = z.object({
  id: Id,
  date: LocalDate,
  area: BodyArea,
  kind: BodyNoteKind,
  severity: Severity,
  note: z.string().trim().max(500).default(''),
})
export type BodyNoteCreate = z.infer<typeof BodyNoteCreate>

/** Body of PATCH /api/body-notes/:id: mark it resolved on a day (null re-opens it). */
export const BodyNoteResolve = z.object({ resolved_on: LocalDate.nullable() })
export type BodyNoteResolve = z.infer<typeof BodyNoteResolve>
