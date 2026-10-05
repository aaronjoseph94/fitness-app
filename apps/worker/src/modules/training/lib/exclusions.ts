// Owns: removing an exclusion (DELETE /api/exclusions/:id) — un-hiding an exercise, or a category, Aaron hid. A soft
// delete (removed_at): the row stays, so re-running the seed (INSERT OR IGNORE by its deterministic id) or restoring an
// export never hides the exercise again. The body-only rail is not an exclusion row (library rule 3), so no delete can
// bring bodyweight exercises back.
import type { Ok } from '@fitness/shared/schemas'
import { and, eq, isNull, or } from 'drizzle-orm'
import { exercise_exclusions } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { HttpError } from '../../../lib/http-error'

/**
 * Un-hide (removed_at = now) the exclusion with this id, or the one of the exercise with this id; an unknown or removed
 * id is a no-op. Only Aaron (403 otherwise).
 */
export async function deleteExclusion(deps: Deps, id: string): Promise<Ok> {
  if (deps.actor !== 'user') throw new HttpError(403, 'user_only', 'Only Aaron changes which exercises are hidden')
  const now = deps.now().toISOString()
  await deps.db
    .update(exercise_exclusions)
    .set({ removed_at: now, actor: deps.actor, updated_at: now })
    .where(and(or(eq(exercise_exclusions.id, id), eq(exercise_exclusions.exercise_id, id)), isNull(exercise_exclusions.removed_at)))
  return { ok: true }
}
