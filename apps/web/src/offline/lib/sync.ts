// Owns: replaying the queue to the Worker — one flush at a time, strictly in order, with backoff — and what triggers a replay
// (app start, `online`, the app becoming visible, any successful API call, a new queued write). The page flushes, not the
// service worker: iOS has no Background Sync.
import { db } from './db'
import { pruneCache } from './cache'
import { addWrite, type NewWrite, type PendingWrite } from './queue'

/** What happened when one queued write was sent. The sender classifies; the queue only acts on the outcome. */
export type SendOutcome =
  /** Stored by the Worker (or already stored: replays are idempotent). */
  | { kind: 'sent' }
  /** Network down, timeout, 429 or 5xx: keep it and try again later. */
  | { kind: 'retry'; error: string }
  /** The Access session expired: keep everything and stop until Aaron signs in again. */
  | { kind: 'auth-expired' }
  /** A 4xx the Worker will never accept: move it to the rejected list so it is visible, not lost. */
  | { kind: 'rejected'; status: number; error: string }

export type QueueSender = (write: PendingWrite) => Promise<SendOutcome>

export interface OfflineSyncOptions {
  send: QueueSender
  /** Called after a flush that delivered at least one write, e.g. to refetch server state. */
  onSynced?: () => void
}

/** Backoff after a retryable failure: 2 s × 2^(attempts − 1), capped at 5 minutes. */
const RETRY_BASE_MS = 2_000
const RETRY_MAX_MS = 5 * 60_000
const PERSIST_REQUESTED_KEY = 'fitness.storage-persist-requested'

let sync: OfflineSyncOptions | null = null
let running: Promise<void> | null = null
let flushAgain = false
let retryAt = 0
let retryTimer: ReturnType<typeof setTimeout> | undefined

/** Wire the queue to a sender and start the triggers. Call once at app start; returns a stop function. */
export function startOfflineSync(options: OfflineSyncOptions): () => void {
  sync = options
  const onOnline = () => void flushNow()
  const onVisibility = () => {
    if (document.visibilityState === 'visible') void flushNow()
  }
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisibility)
  void requestPersistentStorage()
  void pruneCache().catch((error: unknown) => console.warn('[offline] cache prune failed', error))
  void flushNow()
  return () => {
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisibility)
    clearTimeout(retryTimer)
    sync = null
  }
}

/**
 * Replay the queue unless a backoff is pending (the retry timer will run it). Concurrent requests coalesce into the
 * running flush plus at most one more pass.
 */
export function requestFlush(): Promise<void> {
  const current = sync
  if (!current || Date.now() < retryAt) return Promise.resolve()
  if (running) {
    flushAgain = true
    return running
  }
  running = (async () => {
    let delivered = 0
    do {
      flushAgain = false
      delivered += await flushOnce(current.send)
    } while (flushAgain)
    if (delivered > 0) current.onSynced?.()
  })()
    .catch((error: unknown) => console.warn('[offline] flush failed', error))
    .finally(() => {
      running = null
      // A request that arrived after the last pass but before this point would otherwise be lost.
      if (flushAgain) void requestFlush()
    })
  return running
}

/** Persist a write and kick a flush. Resolves once the write is safely on disk, not when it reaches the Worker. */
export async function queueWrite(write: NewWrite): Promise<PendingWrite> {
  const pending = await addWrite(write)
  void requestFlush()
  return pending
}

/** A fresh chance (back online, app reopened): drop any backoff and replay now. */
function flushNow(): Promise<void> {
  clearTimeout(retryTimer)
  retryAt = 0
  return requestFlush()
}

async function flushOnce(send: QueueSender): Promise<number> {
  if (!navigator.onLine || Date.now() < retryAt) return 0
  let delivered = 0
  for (;;) {
    const write = await db.queue.orderBy('seq').first()
    if (!write || write.seq === undefined) return delivered
    const { seq, ...pending } = write
    const outcome = await send(pending).catch((error: unknown): SendOutcome => ({ kind: 'retry', error: String(error) }))
    switch (outcome.kind) {
      case 'sent':
        await db.queue.delete(seq)
        delivered += 1
        break
      case 'rejected':
        await db.transaction('rw', db.queue, db.rejected, async () => {
          await db.queue.delete(seq)
          await db.rejected.put({
            ...pending,
            status: outcome.status,
            last_error: outcome.error,
            rejected_at: new Date().toISOString(),
          })
        })
        break
      case 'auth-expired':
        return delivered
      case 'retry': {
        const attempts = write.attempts + 1
        await db.queue.update(seq, { attempts, last_error: outcome.error })
        scheduleRetry(attempts)
        return delivered
      }
    }
  }
}

function scheduleRetry(attempts: number): void {
  const delay = Math.min(RETRY_BASE_MS * 2 ** (attempts - 1), RETRY_MAX_MS)
  retryAt = Date.now() + delay
  clearTimeout(retryTimer)
  retryTimer = setTimeout(() => void flushNow(), delay)
}

/** Ask the browser once (first run) not to evict IndexedDB, so queued writes survive storage pressure. */
async function requestPersistentStorage(): Promise<void> {
  try {
    if (!navigator.storage?.persist || (await navigator.storage.persisted())) return
    if (localStorage.getItem(PERSIST_REQUESTED_KEY)) return
    localStorage.setItem(PERSIST_REQUESTED_KEY, new Date().toISOString())
    await navigator.storage.persist()
  } catch (error) {
    console.warn('[offline] persistent storage request failed', error)
  }
}
