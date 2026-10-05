// Owns: the Dexie database 'fitness' — the offline write queue, writes the server refused, and the API read cache.
import Dexie, { type EntityTable } from 'dexie'
import type { HttpMethod } from '@fitness/shared/api'

/** One write waiting to reach the Worker. Replayed strictly in `seq` order so dependent writes (start → end a fast) stay ordered. */
export interface QueuedWrite<Body = unknown> {
  /** Auto-increment insertion order (set by Dexie). */
  seq?: number
  /** Client-generated UUID of this queued write (a handle for the UI; the body carries the entity's own id). */
  id: string
  method: HttpMethod
  /** Built path including any query string, e.g. '/api/fasts/4c1…/end'. */
  path: string
  body: Body
  /** UTC instant the write was made on this device. */
  created_at: string
  attempts: number
  last_error: string | null
}

/** A queued write the Worker answered with a 4xx: kept so Aaron sees it was not saved, never silently dropped. */
export interface RejectedWrite extends QueuedWrite {
  status: number
  rejected_at: string
}

/** Last good response per API query key, so screens still render offline. */
export interface CachedResponse {
  key: string
  data: unknown
  updated_at: string
}

export const db = new Dexie('fitness') as Dexie & {
  queue: EntityTable<QueuedWrite, 'seq'>
  rejected: EntityTable<RejectedWrite, 'id'>
  cache: EntityTable<CachedResponse, 'key'>
}

db.version(1).stores({
  queue: '++seq, &id',
  rejected: 'id, rejected_at',
  cache: 'key, updated_at',
})
