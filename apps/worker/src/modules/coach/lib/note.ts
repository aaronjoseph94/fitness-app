// Owns: writing the dashboard note (`app_notes`) — set_dashboard_note pins a coach note to the top of Today until an
// Edmonton date (inclusive; stored as the instant the next local day starts) or until a newer note replaces it; a
// revert expires it. The notes module reads the note showing now.
import { addDays } from '@fitness/shared/engine'
import type { DashboardNote } from '@fitness/shared/schemas'
import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { app_notes } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { badRequest } from '../../../lib/http-error'
import type { DashboardNoteInput } from './schemas'
import { localInstant } from './time'

export async function setDashboardNote(deps: Deps, input: DashboardNoteInput): Promise<DashboardNote> {
  const now = deps.now().toISOString()
  const until = input.until ? localInstant(addDays(input.until, 1), '00:00') : null
  if (until !== null && until <= now) throw badRequest(`until (${input.until}) is already past`)
  const row = {
    id: crypto.randomUUID(),
    text: input.text,
    until,
    actor: deps.actor,
    created_at: now,
    updated_at: now,
  }
  await deps.db.insert(app_notes).values(row)
  return row
}

/** Stop showing a note now (no-op when it already ended). Returns whether it was still showing. */
export async function expireNote(deps: Deps, id: string): Promise<boolean> {
  const now = deps.now().toISOString()
  const done = await deps.db
    .update(app_notes)
    .set({ until: now, updated_at: now })
    .where(and(eq(app_notes.id, id), or(isNull(app_notes.until), gt(app_notes.until, now))))
    .returning({ id: app_notes.id })
  return done.length > 0
}
