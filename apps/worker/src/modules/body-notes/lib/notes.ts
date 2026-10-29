// Owns: the body_notes rows behind the body-notes module — reading the notes that may be active on a day, the row →
// contract mapping, and the renewal rule (a note logged again on an area and kind that is already active updates that
// note: the later date, the new severity, the new words when there are any).
import { activeBodyNotes as activeOn, addDays } from '@fitness/shared/engine'
import { BODY_NOTE_DAYS, BodyArea, type BodyNote, type BodyNoteCreate } from '@fitness/shared/schemas'
import { and, between, desc, eq, gt, isNull, or } from 'drizzle-orm'
import { body_notes, type Row } from '../../../db'
import type { Deps } from '../../../lib/deps'

/** What a renewal changes, as the note held it before (Undo puts it back). */
export type RenewedFrom = Pick<BodyNote, 'date' | 'severity' | 'note'>

/**
 * Notes active on `day` (engine activeBodyNotes), newest first (date, then last update). The SQL narrows to the
 * 7-day window and unresolved-by-then; the engine decides.
 */
export async function activeRows(deps: Deps, day: string): Promise<BodyNote[]> {
  const rows = await deps.db
    .select()
    .from(body_notes)
    .where(
      and(
        between(body_notes.date, addDays(day, -BODY_NOTE_DAYS), day),
        or(isNull(body_notes.resolved_on), gt(body_notes.resolved_on, day)),
      ),
    )
    .orderBy(desc(body_notes.date), desc(body_notes.updated_at))
  return activeOn(rows.map(toBodyNote), day)
}

/** The note `input` renews: one active on the input's date with the same area and kind (the newest), or undefined. */
export async function renewable(deps: Deps, input: BodyNoteCreate): Promise<BodyNote | undefined> {
  return (await activeRows(deps, input.date)).find((n) => n.area === input.area && n.kind === input.kind)
}

/**
 * The renewal of `note` by `input`:
 *   date     = max(note.date, input.date)   (a back-dated mention never shortens the window)
 *   severity = input.severity               (the latest report)
 *   note     = input.note when non-empty, else the note's own words
 */
export function renewal(note: BodyNote, input: BodyNoteCreate): RenewedFrom {
  return {
    date: input.date > note.date ? input.date : note.date,
    severity: input.severity,
    note: input.note || note.note,
  }
}

export async function rowById(deps: Deps, id: string): Promise<BodyNote | undefined> {
  const [row] = await deps.db.select().from(body_notes).where(eq(body_notes.id, id))
  return row ? toBodyNote(row) : undefined
}

export const toBodyNote = (r: Row<typeof body_notes>): BodyNote => ({
  id: r.id,
  date: r.date,
  area: BodyArea.parse(r.area),
  kind: r.kind,
  severity: r.severity,
  note: r.note,
  resolved_on: r.resolved_on,
  actor: r.actor,
  created_at: r.created_at,
  updated_at: r.updated_at,
})
