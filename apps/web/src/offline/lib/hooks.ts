// Owns: the React views of the offline state — pending writes (live from IndexedDB), refused writes, and online status.
import type { Endpoint } from '@fitness/shared/api'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useSyncExternalStore } from 'react'
import { db, type RejectedWrite } from './db'
import { filterWrites, type BodyOf, type PendingFilter, type PendingWrite } from './queue'

const NONE: never[] = []

/**
 * Writes still waiting for the Worker, oldest first, live. With no argument: all of them (the "pending" badge). With an
 * endpoint: its writes with typed bodies (optimistic display). With a string: writes whose path starts with it.
 */
export function usePendingWrites(): PendingWrite[]
export function usePendingWrites<E extends Endpoint>(endpoint: E): PendingWrite<BodyOf<E>>[]
export function usePendingWrites(pathPrefix: string): PendingWrite[]
export function usePendingWrites(filter?: PendingFilter): PendingWrite[] {
  const all = useLiveQuery(() => db.queue.orderBy('seq').toArray(), [], NONE)
  return useMemo(() => filterWrites(all, filter), [all, filter])
}

/** Queued writes the Worker refused (4xx), oldest first. */
export function useRejectedWrites(): RejectedWrite[] {
  return useLiveQuery(() => db.rejected.orderBy('rejected_at').toArray(), [], NONE)
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** The browser's online flag, live. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  )
}
