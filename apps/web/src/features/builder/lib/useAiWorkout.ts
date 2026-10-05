// Owns: running an AI workout job from the page — POST /api/ai/workout (generate, or fill a partial list), then poll
// GET /api/jobs/:id every 1.5 s until the job is done or failed (3-minute ceiling), exposing the validated WorkoutDraft
// as editable state (swaps change it locally; nothing is written until the caller saves or starts).
import { endpoints } from '@fitness/shared/api'
import type { AiWorkoutRequest, WorkoutDraft } from '@fitness/shared/schemas'
import { useCallback, useEffect, useRef, useState } from 'react'
import { call, useApiQuery } from '../../../api'
import { problemText } from '../../quick-log'

const POLL_MS = 1_500
/** Free-tier providers can queue a while; past this the page says so. */
const SLOW_MS = 20_000
const GIVE_UP_MS = 180_000

export type AiWorkoutState =
  | { status: 'idle' }
  | { status: 'working'; slow: boolean }
  | { status: 'done'; draft: WorkoutDraft; provider: string | null }
  | { status: 'failed'; message: string }

export interface AiWorkout {
  state: AiWorkoutState
  /** Start a job (replaces any earlier one). */
  run: (request: AiWorkoutRequest) => void
  /** Replace the current draft (after a swap). */
  setDraft: (draft: WorkoutDraft) => void
  reset: () => void
}

export function useAiWorkout(): AiWorkout {
  const [jobId, setJobId] = useState<string | null>(null)
  const [state, setState] = useState<AiWorkoutState>({ status: 'idle' })
  const startedAt = useRef(0)
  const runId = useRef(0)

  const job = useApiQuery(
    endpoints.ai.job,
    { params: { id: jobId ?? '00000000-0000-4000-8000-000000000000' } },
    {
      enabled: jobId !== null && state.status === 'working',
      refetchInterval: (q) => (q.state.data && (q.state.data.status === 'done' || q.state.data.status === 'failed') ? false : POLL_MS),
      retry: 3,
      gcTime: 0,
    },
  )

  const data = job.data
  useEffect(() => {
    if (!data || state.status !== 'working') return
    if (data.status === 'done') {
      if ((data.type === 'workout_generate' || data.type === 'workout_fill') && data.result) {
        setState({ status: 'done', draft: data.result, provider: data.provider })
      } else {
        setState({ status: 'failed', message: 'The AI finished without a workout. Try again.' })
      }
    } else if (data.status === 'failed') {
      setState({ status: 'failed', message: data.error ? `The AI couldn't build it: ${data.error}` : "The AI couldn't build a workout. Try again." })
    }
  }, [data, state.status])

  // Slow notice, then give up waiting (the job may still finish; its proposal shows on the AI tab).
  useEffect(() => {
    if (state.status !== 'working') return
    const t = setInterval(() => {
      const elapsed = Date.now() - startedAt.current
      if (elapsed > GIVE_UP_MS) {
        setState({ status: 'failed', message: 'Still no answer after 3 minutes. The AI tab will show it if it arrives.' })
      } else if (elapsed > SLOW_MS && !state.slow) {
        setState({ status: 'working', slow: true })
      }
    }, 1_000)
    return () => clearInterval(t)
  }, [state])

  useEffect(() => {
    if (job.error && state.status === 'working' && !job.error.transient) setState({ status: 'failed', message: problemText(job.error) })
  }, [job.error, state.status])

  const run = useCallback((request: AiWorkoutRequest) => {
    const mine = ++runId.current
    startedAt.current = Date.now()
    setJobId(null)
    setState({ status: 'working', slow: false })
    call(endpoints.ai.workout, { body: request }).then(
      (ref) => mine === runId.current && setJobId(ref.job_id),
      (error: unknown) => mine === runId.current && setState({ status: 'failed', message: problemText(error) }),
    )
  }, [])

  const setDraft = useCallback(
    (draft: WorkoutDraft) => setState((s) => (s.status === 'done' ? { ...s, draft } : s)),
    [],
  )

  const reset = useCallback(() => {
    runId.current++
    setJobId(null)
    setState({ status: 'idle' })
  }, [])

  return { state, run, setDraft, reset }
}
