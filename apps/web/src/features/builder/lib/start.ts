// Owns: the builder's writes — save a template (create or replace, queued offline), and start a session from a template
// (POST /api/sessions with a client id, then open the session logger at SESSION_PATH). An AI draft is started by saving it
// as an `ai` template first, so the logger always reads its exercises from the session's template.
import { endpoints } from '@fitness/shared/api'
import type { SessionOrigin, TemplateExerciseInput, TemplateOrigin } from '@fitness/shared/schemas'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useApiMutation } from '../../../api'

/** The session logger's route (features/train). */
export const sessionPath = (sessionId: string) => `/train/session/${sessionId}`

export interface TemplateInput {
  /** Existing template id to replace; omitted creates a new template. */
  id?: string
  name: string
  origin: TemplateOrigin
  notes: string | null
  exercises: TemplateExerciseInput[]
}

export interface SaveOutcome {
  templateId: string
  queued: boolean
}

export function useTemplateWrites() {
  const navigate = useNavigate()
  const create = useApiMutation(endpoints.training.createTemplate, { invalidates: [endpoints.training.listTemplates] })
  const patch = useApiMutation(endpoints.training.updateTemplate, { invalidates: [endpoints.training.listTemplates] })
  const session = useApiMutation(endpoints.training.startSession)
  const [error, setError] = useState<unknown>(null)

  /** Create or replace a template. Rejects with ApiError when the Worker refuses it (queued offline counts as saved). */
  const save = async (t: TemplateInput): Promise<SaveOutcome> => {
    setError(null)
    try {
      if (t.id) {
        const outcome = await patch.mutateAsync({ params: { id: t.id }, body: { name: t.name, notes: t.notes, exercises: t.exercises } })
        return { templateId: t.id, queued: outcome.status === 'queued' }
      }
      const id = crypto.randomUUID()
      const outcome = await create.mutateAsync({
        body: { id, name: t.name, origin: t.origin, notes: t.notes ?? undefined, exercises: t.exercises },
      })
      return { templateId: id, queued: outcome.status === 'queued' }
    } catch (e) {
      setError(e)
      throw e
    }
  }

  /** Start a session from a saved template and open the logger. */
  const start = async (templateId: string, origin: SessionOrigin): Promise<void> => {
    setError(null)
    const id = crypto.randomUUID()
    try {
      await session.mutateAsync({ body: { id, template_id: templateId, origin, started_at: new Date().toISOString() } })
    } catch (e) {
      setError(e)
      throw e
    }
    navigate(sessionPath(id))
  }

  return { save, start, busy: create.isPending || patch.isPending || session.isPending, error }
}
