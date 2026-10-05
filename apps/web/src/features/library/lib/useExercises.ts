// Owns: reading the exercise library — one GET /api/exercises?scope=all per session (the list is ~880 rows without
// instructions and rarely changes; filtering happens on the phone), shared by the picker, the library, the detail sheet
// and the builder; an id index; whether the read is waiting for a connection with nothing cached (offline before the
// library ever loaded on this phone); and what goes stale when the allowed set changes (equipment statuses, exclusions).
import { endpoints } from '@fitness/shared/api'
import type { ExerciseSummary } from '@fitness/shared/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { apiQueryKey, useApiQuery } from '../../../api'
import { ALL_EXERCISES, EXERCISES_STALE_MS } from '../queries'

/** The whole library (allowed and not); each row carries `allowed`. Cached for 10 minutes, offline-capable. */
export function useExercises() {
  return useApiQuery(endpoints.training.listExercises, ALL_EXERCISES, { staleTime: EXERCISES_STALE_MS, gcTime: 60 * 60_000 })
}

export interface ExerciseIndex {
  all: readonly ExerciseSummary[]
  /** The allowed exercise set (what the AI sees). */
  allowed: readonly ExerciseSummary[]
  byId: ReadonlyMap<string, ExerciseSummary>
  isLoading: boolean
  /** Offline with nothing cached yet: the read waits for a connection (no error, not loading). */
  paused: boolean
  error: unknown
  refetch: () => void
}

const EMPTY: readonly ExerciseSummary[] = []

/** The library as an index: every exercise by id, plus the allowed subset. */
export function useExerciseIndex(): ExerciseIndex {
  const query = useExercises()
  const data = query.data ?? EMPTY
  const { refetch } = query
  return useMemo(
    () => ({
      all: data,
      allowed: data.filter((e) => e.allowed),
      byId: new Map(data.map((e) => [e.id, e])),
      isLoading: query.isLoading,
      paused: query.isPending && query.fetchStatus === 'paused',
      error: query.error,
      refetch: () => void refetch(),
    }),
    [data, query.isLoading, query.isPending, query.fetchStatus, query.error, refetch],
  )
}

/**
 * After a write that changes the allowed set (equipment status, exclusion): refetch the library once the Worker has
 * it. A queued write is not refetched (the server would still answer with the old flags).
 */
export function useRefreshLibrary(): (outcome: { status: 'saved' | 'queued' }) => void {
  const queryClient = useQueryClient()
  return useCallback(
    (outcome) => {
      if (outcome.status === 'saved') void queryClient.invalidateQueries({ queryKey: apiQueryKey(endpoints.training.listExercises) })
    },
    [queryClient],
  )
}

/** Mark an exercise as outside the allowed set in the cached library at once (the write may still be queued offline). */
export function useMarkHidden(): (exerciseId: string) => void {
  const queryClient = useQueryClient()
  return useCallback(
    (exerciseId: string) =>
      queryClient.setQueryData<ExerciseSummary[]>(apiQueryKey(endpoints.training.listExercises, ALL_EXERCISES), (list) =>
        list?.map((e) => (e.id === exerciseId ? { ...e, allowed: false } : e)),
      ),
    [queryClient],
  )
}
