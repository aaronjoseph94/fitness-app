// Owns: one HTTP attempt against a provider — the per-invocation fetch budget, the per-attempt AbortSignal.timeout,
// and turning any non-2xx, timeout or network error into an AttemptFailure (with Retry-After or Gemini RetryInfo).
// Bodies of failed responses are read only for a machine error code; their text is never logged or rethrown.
import { AttemptFailure, BudgetError } from './errors'
import type { WireRequest } from './types'

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>

/** External fetches allowed per invocation, shared by everything that holds the same object. */
export interface FetchBudget {
  limit: number
  used: number
}

/** Retry-After as seconds or an HTTP date, or Gemini's google.rpc.RetryInfo `retryDelay: "12s"`. */
function retryAfterMs(res: Response, body: unknown, nowMs: number): number | undefined {
  const h = res.headers.get('retry-after')
  if (h) {
    const secs = Number(h)
    if (Number.isFinite(secs)) return Math.max(0, secs * 1000)
    const at = Date.parse(h)
    if (Number.isFinite(at)) return Math.max(0, at - nowMs)
  }
  const details = (body as { error?: { details?: { retryDelay?: unknown }[] } } | undefined)?.error?.details
  for (const d of details ?? []) {
    const m = typeof d.retryDelay === 'string' ? /^([\d.]+)s$/.exec(d.retryDelay) : null
    if (m) return Number(m[1]) * 1000
  }
  return undefined
}

/** Provider error code, or DAILY_QUOTA when Gemini's QuotaFailure names a per-day quota. */
function errorCode(body: unknown): string | undefined {
  const e = (
    body as
      | {
          error?: {
            status?: unknown
            code?: unknown
            type?: unknown
            details?: { violations?: { quotaId?: unknown }[] }[]
          }
        }
      | undefined
  )?.error
  if (
    e?.details?.some((d) =>
      d.violations?.some((v) => typeof v.quotaId === 'string' && v.quotaId.includes('PerDay')),
    )
  )
    return 'DAILY_QUOTA'
  const c = e?.status ?? e?.type ?? e?.code
  return typeof c === 'string' || typeof c === 'number' ? String(c).slice(0, 64) : undefined
}

/** Send one request. Resolves with the parsed 2xx JSON body; throws AttemptFailure or BudgetError. */
export async function send(
  fetchFn: FetchFn,
  budget: FetchBudget,
  req: WireRequest,
  timeoutMs: number,
  nowMs: number,
): Promise<unknown> {
  if (budget.used >= budget.limit) throw new BudgetError(budget.limit)
  budget.used++
  let res: Response
  try {
    res = await fetchFn(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
    })
  } catch (e) {
    const name = (e as { name?: string } | null)?.name
    throw new AttemptFailure(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network')
  }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    body = undefined
  }
  if (res.ok) {
    if (body === undefined) throw new AttemptFailure('server', res.status, undefined, 'BAD_JSON')
    return body
  }
  const s = res.status
  const code = errorCode(body)
  if (s === 429) throw new AttemptFailure('rate_limited', s, retryAfterMs(res, body, nowMs), code)
  if (s === 408) throw new AttemptFailure('timeout', s, undefined, code)
  if (s >= 500) throw new AttemptFailure('server', s, retryAfterMs(res, body, nowMs), code)
  throw new AttemptFailure('client', s, undefined, code)
}
