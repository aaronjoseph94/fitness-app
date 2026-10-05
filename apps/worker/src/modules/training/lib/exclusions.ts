// Owns: removing an exclusion (DELETE /api/exclusions/:id) — un-hiding an exercise, or a category, Aaron hid. The
// body-only rail is not an exclusion row (library rule 3), so no delete can bring bodyweight exercises back.
import type { Ok } from '@fitness/shared/schemas'
import { eq } from 'drizzle-orm'
import { exercise_exclusions } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { HttpError } from '../../../lib/http-error'

/** Delete one exclusion row; an unknown id is already gone. Only Aaron edits the allowed exercise set (403 otherwise). */
export async function deleteExclusion(deps: Deps, id: string): Promise<Ok> {
  if (deps.actor !== 'user') throw new HttpError(403, 'user_only', 'Only Aaron changes which exercises are hidden')
  await deps.db.delete(exercise_exclusions).where(eq(exercise_exclusions.id, id))
  return { ok: true }
}
