// Owns: the public surface of offline support — the durable write queue (Dexie) and its replay, the API read cache,
// and the hooks the shell and features use to show pending, refused and offline states.
export type { RejectedWrite } from './lib/db'
export type { BodyOf, NewWrite, PendingFilter, PendingWrite } from './lib/queue'
export { dismissRejectedWrite, hasPendingWrites, readPendingWrites } from './lib/queue'
export type { OfflineSyncOptions, QueueSender, SendOutcome } from './lib/sync'
export { queueWrite, requestFlush, startOfflineSync } from './lib/sync'
export { responseCache } from './lib/cache'
export { useOnline, usePendingWrites, useRejectedWrites } from './lib/hooks'
