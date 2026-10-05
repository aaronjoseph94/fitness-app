// Owns: AI workout drafts still waiting for a tap — the pending `workout` proposals in the live feed (the nightly draft
// for the next training day, a generate or fill that finished after its page closed) as WorkoutDrafts carrying their
// proposal_id, so the Train tab can offer one and the AI page can preview, start or save it (which accepts it).
import { endpoints } from '@fitness/shared/api'
import type { LocalDate, Proposal, WorkoutDraft } from '@fitness/shared/schemas'
import { useMemo } from 'react'
import { useApiQuery } from '../../../api'

export interface PendingWorkout {
  /** The proposal's id (also the draft's proposal_id). */
  id: string
  /** The day it was drafted for, if any. */
  date: LocalDate | null
  draft: WorkoutDraft
}

/** Pending workout drafts in the feed, newest first. */
export function usePendingWorkouts(): PendingWorkout[] {
  const feed = useApiQuery(endpoints.day.events, { query: {} }, { staleTime: 30_000 })
  const events = feed.data?.events
  return useMemo(
    () =>
      (events ?? [])
        .filter((e): e is Proposal => e.kind === 'proposal' && e.proposal_status === 'pending' && e.body.kind === 'workout')
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .flatMap((p) =>
          p.body.kind === 'workout'
            ? [{ id: p.id, date: p.body.date, draft: { ...p.body.workout, muscle_scores: p.body.workout.muscle_scores ?? p.body.muscle_scores, proposal_id: p.id } }]
            : [],
        ),
    [events],
  )
}

/** The AI page opened on one pending draft. */
export const pendingWorkoutPath = (proposalId: string) => `/train/ai?proposal=${proposalId}`
