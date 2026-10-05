// Owns: the TanStack Query bindings — stable query keys from endpoint + input, reads that fall back to the last good
// response when offline, and mutations that go through the offline queue and mark dependent queries stale.
import type { Endpoint, EndpointInput, EndpointOutput } from '@fitness/shared/api'
import {
  hashKey,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query'
import { responseCache, whenIdle } from '../../offline'
import { exchange, parseResponse, toWireRequest } from './call'
import { isApiError, type ApiError } from './errors'
import { write, type WriteOutcome } from './write'

/**
 * Query key for API data: ['api'] (everything), ['api', method, path] (every input of one endpoint — use it to
 * invalidate), or ['api', method, path, input] (one query).
 */
export function apiQueryKey(endpoint?: Endpoint, input?: unknown): QueryKey {
  if (!endpoint) return ['api']
  const base = ['api', endpoint.method, endpoint.path]
  return input === undefined ? base : [...base, input]
}

export type ApiQueryOptions<E extends Endpoint, TData = EndpointOutput<E>> = Omit<
  UseQueryOptions<EndpointOutput<E>, ApiError, TData>,
  'queryKey' | 'queryFn'
>

/**
 * Read an endpoint. Offline (or with the Access session expired) it serves the last good response for the same input,
 * re-validated against the current schema; it fails only when there is none.
 */
export function useApiQuery<E extends Endpoint, TData = EndpointOutput<E>>(
  endpoint: E,
  input: EndpointInput<E>,
  options?: ApiQueryOptions<E, TData>,
): UseQueryResult<TData, ApiError> {
  return useQuery({
    // Run the query function even offline so it can answer from the cache.
    networkMode: 'offlineFirst',
    retry: retryTransient,
    ...options,
    queryKey: apiQueryKey(endpoint, input),
    queryFn: ({ signal }) => readThrough(endpoint, input, signal),
  })
}

/** Transient failures (network, 5xx, 429) are tried twice more; everything else fails at once. */
const retryTransient = (failureCount: number, error: ApiError) => error.transient && failureCount < 2

async function readThrough<E extends Endpoint>(endpoint: E, input: EndpointInput<E>, signal: AbortSignal): Promise<EndpointOutput<E>> {
  const request = toWireRequest(endpoint, input)
  const cacheKey = hashKey(apiQueryKey(endpoint, input))
  let body: unknown
  try {
    body = await exchange(request, { signal })
  } catch (error) {
    if (isApiError(error) && (error.kind === 'network' || error.kind === 'auth-expired')) {
      const cached = await responseCache.read(cacheKey).catch(() => undefined)
      const parsed = cached === undefined ? null : endpoint.response.safeParse(cached)
      if (parsed?.success) return parsed.data as EndpointOutput<E>
    }
    throw error
  }
  const data = parseResponse(endpoint, request, body)
  // The offline copy is not needed to show this response: write it once the page is idle.
  whenIdle(() => void responseCache.write(cacheKey, body).catch((error: unknown) => console.warn('[api] cache write failed', error)))
  return data
}

export type ApiMutationOptions<E extends Endpoint> = Omit<UseMutationOptions<WriteOutcome<E>, ApiError, EndpointInput<E>>, 'mutationFn'> & {
  /** Endpoints whose queries go stale after this write, saved or queued. */
  invalidates?: readonly Endpoint[]
}

/**
 * Write to an endpoint. Resolves with `{ status: 'saved', data }`, or `{ status: 'queued', pending }` when an
 * `offline: 'queue'` endpoint could not be reached (it replays later, in order). Rejects with ApiError otherwise.
 */
export function useApiMutation<E extends Endpoint>(
  endpoint: E,
  options: ApiMutationOptions<E> = {},
): UseMutationResult<WriteOutcome<E>, ApiError, EndpointInput<E>> {
  const queryClient = useQueryClient()
  const { invalidates = [], onSuccess, ...rest } = options
  return useMutation({
    // The mutation decides what offline means (queue or throw), so TanStack must not pause it.
    networkMode: 'always',
    ...rest,
    mutationFn: (input: EndpointInput<E>) => write(endpoint, input),
    onSuccess: (...args) => {
      for (const stale of invalidates) void queryClient.invalidateQueries({ queryKey: apiQueryKey(stale) })
      return onSuccess?.(...args)
    },
  })
}
