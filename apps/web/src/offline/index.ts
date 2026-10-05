// Owns: the public surface of offline support — the durable write queue (Dexie) and its replay, the API read cache,
// the hooks the shell and features use to show pending, refused and offline states, and running non-urgent work when
// the page is idle.
export type { RejectedWrite } from './lib/db'
export type { BodyOf, NewWrite, PendingFilter, PendingWrite } from './lib/queue'
export { discardPendingWrite, dismissRejectedWrite, hasPendingWrites, readPendingWrites } from './lib/queue'
export type { OfflineSyncOptions, QueueSender, SendOutcome } from './lib/sync'
export { flushNow, MAX_SERVER_ERRORS, queueWrite, requestFlush, startOfflineSync } from './lib/sync'
export { responseCache } from './lib/cache'
export { whenIdle } from './lib/idle'
export { useOnline, usePendingWrites, useRejectedWrites } from './lib/hooks'
