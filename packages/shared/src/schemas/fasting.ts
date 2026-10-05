// Owns: fasts — the fast log row, the start / end / plan / move bodies and the list query.
// A planned fast is a row with planned = true whose started_at is the planned start; starting it with its id begins it.
import * as z from 'zod'
import { Id, Instant, LocalDate, Row } from './common'

export const Fast = Row.extend({
  started_at: Instant,
  ended_at: Instant.nullable(),
  planned: z.boolean(),
  note: z.string().nullable(),
})
export type Fast = z.infer<typeof Fast>

/** A day's fast state: none, a planned fast not yet started, one running, or one that ended. */
export const FastState = z.enum(['none', 'scheduled', 'active', 'ended'])
export type FastState = z.infer<typeof FastState>

const FastNote = z.string().trim().max(500)

/**
 * Body of POST /api/fasts/start. Pass a planned fast's id to start it; a new id starts an ad-hoc fast.
 * `started_at` defaults to now.
 */
export const FastStart = z.object({ id: Id, started_at: Instant.optional(), note: FastNote.optional() })
export type FastStart = z.infer<typeof FastStart>

/** Body of POST /api/fasts/:id/end. `ended_at` defaults to now. */
export const FastEnd = z.object({ ended_at: Instant.optional() })
export type FastEnd = z.infer<typeof FastEnd>

/** Body of POST /api/fasts/plan: put one of the month's fasts on the calendar. */
export const FastPlan = z.object({ id: Id, started_at: Instant, note: FastNote.optional() })
export type FastPlan = z.infer<typeof FastPlan>

/** Body of PATCH /api/fasts/:id: move a planned fast that has not started (same monthly pattern check as planning). */
export const FastMove = z.object({ started_at: Instant, note: FastNote.optional() })
export type FastMove = z.infer<typeof FastMove>

/** Query of GET /api/fasts (fasts overlapping the range; both ends optional). */
export const FastListQuery = z.object({ from: LocalDate.optional(), to: LocalDate.optional() })
export type FastListQuery = z.infer<typeof FastListQuery>
