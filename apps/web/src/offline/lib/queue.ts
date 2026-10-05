// Owns: queue storage operations — add a write, read pending writes (all, by endpoint, or by path prefix), dismiss a refused one.
import type { Endpoint } from '@fitness/shared/api'
import type * as z from 'zod'
import { db, type QueuedWrite } from './db'

export type PendingWrite<Body = unknown> = Omit<QueuedWrite<Body>, 'seq'>
export type NewWrite = Pick<QueuedWrite, 'method' | 'path' | 'body'>

/** Which pending writes to read: every one, those for one endpoint (method + path pattern), or those under a path prefix. */
export type PendingFilter = Endpoint | string | undefined

/** The request body type of an endpoint, as the caller wrote it. */
export type BodyOf<E extends Endpoint> = E['body'] extends z.ZodType ? z.input<E['body']> : undefined

/**
 * Persist a write. Every write gets its own `id` (two offline edits of one entity are two writes); replays stay
 * idempotent on the Worker because the body carries the entity's client-generated UUID.
 */
export async function addWrite(write: NewWrite): Promise<PendingWrite> {
  const row: QueuedWrite = {
    id: crypto.randomUUID(),
    method: write.method,
    path: write.path,
    body: write.body,
    created_at: new Date().toISOString(),
    attempts: 0,
    last_error: null,
  }
  await db.queue.add(row)
  return row
}

export async function hasPendingWrites(): Promise<boolean> {
  return (await db.queue.count()) > 0
}

export async function readPendingWrites(): Promise<PendingWrite[]>
export async function readPendingWrites<E extends Endpoint>(endpoint: E): Promise<PendingWrite<BodyOf<E>>[]>
export async function readPendingWrites(pathPrefix: string): Promise<PendingWrite[]>
export async function readPendingWrites(filter?: PendingFilter): Promise<PendingWrite[]> {
  return filterWrites(await db.queue.orderBy('seq').toArray(), filter)
}

export function filterWrites(writes: PendingWrite[], filter: PendingFilter): PendingWrite[] {
  if (filter === undefined) return writes
  if (typeof filter === 'string') return writes.filter((w) => w.path.startsWith(filter))
  const pattern = pathPattern(filter.path)
  return writes.filter((w) => w.method === filter.method && pattern.test(w.path))
}

export async function dismissRejectedWrite(id: string): Promise<void> {
  await db.rejected.delete(id)
}

/** '/api/fasts/:id/end' → /^\/api\/fasts\/[^/]+\/end(\?|$)/ */
function pathPattern(path: string): RegExp {
  const source = path
    .split('/')
    .map((segment) => (segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/')
  return new RegExp(`^${source}(\\?|$)`)
}
