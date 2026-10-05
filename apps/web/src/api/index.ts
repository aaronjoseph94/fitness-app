// Owns: the public surface of the typed API client over the shared endpoint contract (@fitness/shared/api):
// one-off calls (JSON bodies, or Binary ones as octet-stream), TanStack Query hooks (offline-aware reads, queue-aware
// writes, a queued upload kept as a Blob), errors and their plain
// wording, signed file links fetched as bytes, and the Access session signal.
export { ApiError, isApiError, type ApiErrorKind } from './lib/errors'
export { problemText } from './lib/problem'
export { fetchFile } from './lib/transport'
export { call } from './lib/call'
export {
  apiQueryKey,
  useApiMutation,
  useApiQuery,
  type ApiMutationOptions,
  type ApiQueryOptions,
} from './lib/query'
export { sendQueuedWrite, type WriteOutcome } from './lib/write'
export { clearSignInMarker, signInAgain, useAuthExpired } from './lib/session'
