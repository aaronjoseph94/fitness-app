// Owns: the public surface of the typed API client over the shared endpoint contract (@fitness/shared/api):
// one-off calls, TanStack Query hooks (offline-aware reads, queue-aware writes), errors, and the Access session signal.
export { ApiError, isApiError, type ApiErrorKind } from './lib/errors'
export { call } from './lib/call'
export { apiQueryKey, useApiMutation, useApiQuery, type ApiMutationOptions, type ApiQueryOptions } from './lib/query'
export { sendQueuedWrite, type WriteOutcome } from './lib/write'
export { clearSignInMarker, signInAgain, useAuthExpired } from './lib/session'
