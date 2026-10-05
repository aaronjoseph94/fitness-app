// Owns: ApiError — the one error type every API call throws, classified so callers branch on `kind`, never on messages.
import type * as z from 'zod'

export type ApiErrorKind =
  /** No response: offline, DNS, timeout. Safe to retry; queueable writes were queued instead of throwing. */
  | 'network'
  /** Cloudflare Access answered with a redirect (session expired). The shell shows "Sign in again". */
  | 'auth-expired'
  /** The Worker answered with a non-2xx status. */
  | 'http'
  /** The input failed the endpoint's own Zod schema; nothing was sent. */
  | 'invalid-request'
  /** A 2xx body that does not match the endpoint's response schema (client and Worker out of step). */
  | 'invalid-response'

export class ApiError extends Error {
  override readonly name = 'ApiError'
  readonly kind: ApiErrorKind
  /** HTTP status for 'http', otherwise null. */
  readonly status: number | null
  /** The Worker's `error` code from a JSON error body, when present. */
  readonly code: string | null
  /** Parsed error body, or the Zod issues for 'invalid-request' / 'invalid-response'. */
  readonly detail: unknown
  /** 'POST /api/water' — which call failed. */
  readonly request: string

  constructor(init: { kind: ApiErrorKind; request: string; message: string; status?: number; code?: string | null; detail?: unknown }) {
    super(init.message)
    this.kind = init.kind
    this.request = init.request
    this.status = init.status ?? null
    this.code = init.code ?? null
    this.detail = init.detail
  }

  /** Worth retrying later: the request may succeed unchanged (network, timeout, 408/425/429, 5xx). */
  get transient(): boolean {
    if (this.kind === 'network') return true
    return this.kind === 'http' && this.status !== null && (this.status >= 500 || [408, 425, 429].includes(this.status))
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function schemaError(kind: 'invalid-request' | 'invalid-response', request: string, error: z.ZodError): ApiError {
  const first = error.issues[0]
  const where = first?.path.length ? ` at ${first.path.join('.')}` : ''
  return new ApiError({ kind, request, message: `${first?.message ?? 'Invalid data'}${where}`, detail: error.issues })
}
