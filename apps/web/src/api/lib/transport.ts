// Owns: the wire — one HTTP request to the Worker with the Access cookie, no redirect following, a timeout, JSON in and
// out (a binary body goes as application/octet-stream) — and the classification of every failure into an ApiError,
// including spotting an expired Access session. Signed /api/files/* links are fetched as bytes through the same checks.
import type { HttpMethod } from '@fitness/shared/api'
import { ApiError } from './errors'
import { markAuthExpired } from './session'

export interface WireRequest {
  method: HttpMethod
  /** Built path including the query string (a binary body's metadata travels here). */
  path: string
  /** JSON-serialisable, or a BinaryBody sent as raw bytes. */
  body?: unknown
}

/** A raw body (a Binary endpoint's ArrayBuffer, or the Blob the offline queue stored it as). */
export type BinaryBody = Blob | ArrayBuffer

export function isBinaryBody(body: unknown): body is BinaryBody {
  return body instanceof Blob || body instanceof ArrayBuffer
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
  const encoded = encodeBody(request.body)
  let response: Response
  try {
    response = await fetch(request.path, {
      method: request.method,
      headers: encoded.headers,
      body: encoded.body,
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

/**
 * Fetch a signed /api/files/* link as bytes. Same classification as `send`: an Access bounce throws 'auth-expired' and
 * raises the "Sign in again" banner, a non-2xx throws 'http', no response throws 'network'.
 */
export async function fetchFile(url: string, options: { signal?: AbortSignal } = {}): Promise<ArrayBuffer> {
  const label = `GET ${new URL(url, window.location.href).pathname}`
  let response: Response
  try {
    response = await fetch(url, { credentials: 'include', redirect: 'manual', signal: options.signal })
  } catch (cause) {
    if (options.signal?.aborted) throw cause
    throw await classifyNoResponse(label)
  }
  if (isAccessBounce(response)) throw authExpired(label)
  if (!response.ok) throw httpError(label, response.status, await readBody(response))
  return response.arrayBuffer()
}

function encodeBody(body: unknown): { headers: Record<string, string>; body: BodyInit | undefined } {
  if (body === undefined) return { headers: { Accept: 'application/json' }, body: undefined }
  if (isBinaryBody(body)) return { headers: { Accept: 'application/json', 'Content-Type': 'application/octet-stream' }, body }
  return { headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
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
