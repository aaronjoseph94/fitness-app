// Owns: the notes module's interface — the dashboard note showing now (the newest `app_notes` row whose `until` is
// null or still in the future). Today's DayView and GET /api/notes both read it from here.
import type { DashboardNote } from '@fitness/shared/schemas'
import { desc, gt, isNull, or } from 'drizzle-orm'
import { app_notes } from '../../db'
import type { Deps } from '../../lib/deps'

/** The note pinned to Today at deps.now(), or null. Instants are stored UTC-normalised, so they compare as strings. */
export async function activeNote(deps: Deps): Promise<DashboardNote | null> {
  const now = deps.now().toISOString()
  const [row] = await deps.db
    .select()
    .from(app_notes)
    .where(or(isNull(app_notes.until), gt(app_notes.until, now)))
    .orderBy(desc(app_notes.created_at))
    .limit(1)
  return row
    ? { id: row.id, text: row.text, until: row.until, actor: row.actor, created_at: row.created_at, updated_at: row.updated_at }
    : null
}
