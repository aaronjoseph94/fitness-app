// Owns: the wire — one HTTP request to the Worker with the Access cookie, no redirect following, a timeout, JSON in and
// out — and the classification of every failure into an ApiError, including spotting an expired Access session.
import type { HttpMethod } from '@fitness/shared/api'
import { ApiError } from './errors'
import { markAuthExpired } from './session'

export interface WireRequest {
  method: HttpMethod
  /** Built path including the query string. */
  path: string
  body?: unknown
}

export interface SendOptions {
  /** Caller cancellation (e.g. TanStack Query unmount). An abort rethrows the AbortError untouched. */
  signal?: AbortSignal
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 30_000
const PROBE_TIMEOUT_MS = 5_000
/** Behind Access like every /api route; used only to tell "network down" from "Access is bouncing us". */
const SESSION_PROBE_PATH = '/api/health'

/** Send one request. Resolves with the parsed body (undefined when empty) of a 2xx; throws ApiError otherwise. */
export async function send(request: WireRequest, options: SendOptions = {}): Promise<unknown> {
  const label = `${request.method} ${request.path}`
  const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const hasBody = request.body !== undefined
  let response: Response
  try {
    response = await fetch(request.path, {
      method: request.method,
      headers: hasBody ? { Accept: 'application/json', 'Content-Type': 'application/json' } : { Accept: 'application/json' },
      body: hasBody ? JSON.stringify(request.body) : undefined,
      credentials: 'include',
      // Access answers an expired session with a redirect to its login page: see it, never follow it.
      redirect: 'manual',
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    })
  } catch (cause) {
    if (options.signal?.aborted) throw cause
    if (timeout.aborted) throw new ApiError({ kind: 'network', request: label, message: 'The server took too long to answer' })
    throw await classifyNoResponse(label)
  }
  if (isAccessBounce(response)) throw authExpired(label)
  const body = await readBody(response)
  if (!response.ok) throw httpError(label, response.status, body)
  return body
}

function isAccessBounce(response: Response): boolean {
  return response.type === 'opaqueredirect' || response.status === 401
}

function authExpired(label: string): ApiError {
  markAuthExpired()
  return new ApiError({ kind: 'auth-expired', request: label, message: 'Your sign-in expired' })
}

/** Online but no response: the network dropped, or Access is in the way. One probe tells them apart. */
async function classifyNoResponse(label: string): Promise<ApiError> {
  if (navigator.onLine) {
    try {
      const probe = await fetch(SESSION_PROBE_PATH, {
        credentials: 'include',
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      })
      if (isAccessBounce(probe)) return authExpired(label)
    } catch {
      // Still unreachable: a network failure.
    }
  }
  return new ApiError({
    kind: 'network',
    request: label,
    message: navigator.onLine ? 'Could not reach the server' : 'You are offline',
  })
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  if (!(response.headers.get('content-type') ?? '').includes('json')) return text
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function httpError(label: string, status: number, body: unknown): ApiError {
  const fields = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const code = typeof fields.error === 'string' ? fields.error : null
  const message = typeof fields.message === 'string' ? fields.message : (code ?? `HTTP ${status}`)
  return new ApiError({ kind: 'http', request: label, status, code, message, detail: body })
}
