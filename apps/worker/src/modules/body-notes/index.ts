// Owns: the body-notes module's interface — how Aaron says his body feels on a day (a sore knee, low energy, a cold),
// stored with deps.actor. A note is active for 7 days after its date unless resolved (engine activeBodyNotes); active
// notes steer generated workouts (engine bodyNoteSteer: muscles to avoid, reduced volume) through workouts-ai and the
// training readiness.
// Interface:
//   logBodyNote(deps, BodyNoteCreate)        → LoggedBodyNote  idempotent by id (a replay returns the stored note, with
//        before: null). A note on an area + kind already active on its date is renewed instead of duplicated: that
//        note keeps its id and takes the later date, the new severity and the new words (if any); `before` holds its
//        date / severity / note as they were, so Undo can put them back (restoreBodyNote). 400 for a future date.
//   resolveBodyNote(deps, id, BodyNoteResolve) → BodyNote      resolved on a day (null re-opens it); 404, 400 when the
//        day is before the note's date
//   restoreBodyNote(deps, id, before)        → BodyNote        undo a renewal: the date / severity / note it replaced
//   deleteBodyNote(deps, id)                 → Ok              undo a new note (a replayed delete is a no-op)
//   activeBodyNotes(deps, day = today)       → BodyNote[]      active on `day`, newest first
import { today } from '@fitness/shared/engine'
import type { BodyNote, BodyNoteCreate, BodyNoteResolve, Ok } from '@fitness/shared/schemas'
import { eq } from 'drizzle-orm'
import { body_notes } from '../../db'
import type { Deps } from '../../lib/deps'
import { badRequest, notFound } from '../../lib/http-error'
import { activeRows, renewable, renewal, rowById, toBodyNote, type RenewedFrom } from './lib/notes'

export type { RenewedFrom } from './lib/notes'

/** A logged note, and what a renewal replaced (null for a new note or a replay). */
export type LoggedBodyNote = BodyNote & { before: RenewedFrom | null }

/** A device clock a few minutes ahead of the Worker's at midnight still logs "today". */
const CLOCK_SKEW_MS = 5 * 60_000

/** POST /api/body-notes, log_body_note. */
export async function logBodyNote(deps: Deps, input: BodyNoteCreate): Promise<LoggedBodyNote> {
  const stored = await rowById(deps, input.id)
  if (stored) return { ...stored, before: null }
  if (input.date > today(new Date(deps.now().getTime() + CLOCK_SKEW_MS)))
    throw badRequest(`${input.date} has not happened yet; a body note is for today or earlier`)
  const now = deps.now().toISOString()

  const renew = await renewable(deps, input)
  if (renew) {
    const next = renewal(renew, input)
    await deps.db
      .update(body_notes)
      .set({ ...next, actor: deps.actor, updated_at: now })
      .where(eq(body_notes.id, renew.id))
    const after = await rowById(deps, renew.id)
    return { ...after!, before: { date: renew.date, severity: renew.severity, note: renew.note } }
  }

  const [, [row]] = await deps.db.batch([
    deps.db
      .insert(body_notes)
      .values({
        id: input.id,
        date: input.date,
        area: input.area,
        kind: input.kind,
        severity: input.severity,
        note: input.note,
        actor: deps.actor,
        created_at: now,
        updated_at: now,
      })
      .onConflictDoNothing({ target: body_notes.id }),
    deps.db.select().from(body_notes).where(eq(body_notes.id, input.id)),
  ])
  return { ...toBodyNote(row!), before: null }
}

/** PATCH /api/body-notes/:id: resolved on a day, or re-opened with null. */
export async function resolveBodyNote(deps: Deps, id: string, input: BodyNoteResolve): Promise<BodyNote> {
  const note = await rowById(deps, id)
  if (!note) throw notFound('Body note')
  if (input.resolved_on !== null && input.resolved_on < note.date)
    throw badRequest(`A note from ${note.date} can't be resolved on ${input.resolved_on}`)
  await deps.db
    .update(body_notes)
    .set({ resolved_on: input.resolved_on, updated_at: deps.now().toISOString() })
    .where(eq(body_notes.id, id))
  return (await rowById(deps, id))!
}

/** Undo a renewal: the note takes back the date, severity and words it had (LoggedBodyNote.before). */
export async function restoreBodyNote(deps: Deps, id: string, before: RenewedFrom): Promise<BodyNote> {
  const note = await rowById(deps, id)
  if (!note) throw notFound('Body note')
  await deps.db
    .update(body_notes)
    .set({ ...before, updated_at: deps.now().toISOString() })
    .where(eq(body_notes.id, id))
  return (await rowById(deps, id))!
}

/** Undo a new note: the row goes. */
export async function deleteBodyNote(deps: Deps, id: string): Promise<Ok> {
  await deps.db.delete(body_notes).where(eq(body_notes.id, id))
  return { ok: true }
}

/** GET /api/body-notes: the notes active on `day` (default today), newest first. */
export function activeBodyNotes(deps: Deps, day: string = today(deps.now())): Promise<BodyNote[]> {
  return activeRows(deps, day)
}
