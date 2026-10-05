// Owns: the builder's writes — save a template (create or replace, queued offline), start a session from a template,
// and start an AI draft as it stands (POST /api/sessions with a client id and the draft's exercises, then open the
// session logger at sessionPath). Sessions store their own plan, so a draft needs no template to be started. A draft's
// `proposal_id` goes with the first create or start, which accepts that pending workout proposal on the Worker.
import { endpoints } from '@fitness/shared/api'
import type { SessionOrigin, TemplateExerciseInput, TemplateOrigin, WorkoutDraft } from '@fitness/shared/schemas'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useApiMutation } from '../../../api'

/** What accepting a workout proposal makes stale (Today's AI card, the pending count, the AI tab's list). */
const PROPOSAL_REFRESHES = [endpoints.day.get, endpoints.day.events]

/** The session logger's route (features/train). */
export const sessionPath = (sessionId: string) => `/train/session/${sessionId}`

export interface TemplateInput {
  /** Existing template id to replace; omitted creates a new template. */
  id?: string
  name: string
  origin: TemplateOrigin
  notes: string | null
  exercises: TemplateExerciseInput[]
  /** The AI workout proposal this template accepts (create only; a replace cannot accept one). */
  proposal_id?: string
}

export interface SaveOutcome {
  templateId: string
  queued: boolean
}

export function useTemplateWrites() {
  const navigate = useNavigate()
  // Accepting a proposal changes Today's AI card and pending count.
  const create = useApiMutation(endpoints.training.createTemplate, { invalidates: [endpoints.training.listTemplates, ...PROPOSAL_REFRESHES] })
  const patch = useApiMutation(endpoints.training.updateTemplate, { invalidates: [endpoints.training.listTemplates] })
  const session = useApiMutation(endpoints.training.startSession, { invalidates: PROPOSAL_REFRESHES })
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
        body: { id, name: t.name, origin: t.origin, notes: t.notes ?? undefined, exercises: t.exercises, proposal_id: t.proposal_id },
      })
      return { templateId: id, queued: outcome.status === 'queued' }
    } catch (e) {
      setError(e)
      throw e
    }
  }

  const open = async (body: { template_id: string | null; origin: SessionOrigin; exercises?: TemplateExerciseInput[]; proposal_id?: string }) => {
    setError(null)
    const id = crypto.randomUUID()
    try {
      await session.mutateAsync({ body: { id, started_at: new Date().toISOString(), ...body } })
    } catch (e) {
      setError(e)
      throw e
    }
    navigate(sessionPath(id))
  }

  /** Start a session from a saved template and open the logger (`proposal_id`: an AI draft it came from). */
  const start = (templateId: string, origin: SessionOrigin, proposal_id?: string): Promise<void> =>
    open({ template_id: templateId, origin, proposal_id })

  /** Start an AI draft as previewed (swaps included), without saving a template, and open the logger. */
  const startDraft = (draft: WorkoutDraft): Promise<void> =>
    open({ template_id: null, origin: 'ai', exercises: draft.exercises, proposal_id: draft.proposal_id })

  return { save, start, startDraft, busy: create.isPending || patch.isPending || session.isPending, error }
}
