// Owns: every outbound call to a nutrition source — the injected fetch, the per-instance subrequest budget, per-source
// caps, a timeout, the descriptive User-Agent, de-duplication of identical GETs, and switching a source off for the rest
// of the instance after a 429/5xx. Free plan: 50 external subrequests per invocation, shared with the LLM router.
import type { FetchBudget } from '../../../lib/deps'

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>
export type RemoteSource = 'off' | 'usda'

/** Open Food Facts asks every client to identify itself; no contact address is sent (Aaron's choice to add one). */
export const USER_AGENT = 'FitnessTracker/1.0 (personal, non-commercial)'

/** A source could not answer (budget spent, rate-limited, down, timed out). Callers fall back; never shown raw. */
export class SourceUnavailable extends Error {
  constructor(
    readonly source: RemoteSource,
    reason: string,
  ) {
    super(`${source}: ${reason}`)
  }
}

export interface GateOptions {
  fetch: Fetch
  /** External calls this instance may make in total (default 12). */
  maxCalls: number
  /** Per-source caps inside that budget. OFF search is rate-limited hardest (10 req/min). */
  perSource: Record<RemoteSource, number>
  timeoutMs: number
  /** Budgets shared with other adapters of the same invocation; each call needs room in every one and counts in each. */
  shared?: readonly FetchBudget[]
  /** No call starts at or after this instant (epoch ms, read with `now`). */
  until?: number
  now?: () => number
  /** Told about every call made (usage accounting). */
  onCall?: (source: RemoteSource) => void
}


export interface Gate {
  /**
   * GET a JSON document, with extra request headers (e.g. an API key: keys go in headers, never in the URL). Null on
   * 404. Throws SourceUnavailable when the source cannot answer.
   */
  getJson(source: RemoteSource, url: string, headers?: Record<string, string>): Promise<unknown>
}

export function createGate(opts: GateOptions): Gate {
  let calls = 0
  const used: Record<RemoteSource, number> = { off: 0, usda: 0 }
  const down = new Set<RemoteSource>()
  const memo = new Map<string, Promise<unknown>>()

  async function call(source: RemoteSource, url: string, headers: Record<string, string>): Promise<unknown> {
    if (down.has(source)) throw new SourceUnavailable(source, 'unavailable for this run')
    if (calls >= opts.maxCalls || used[source] >= opts.perSource[source] || opts.shared?.some((b) => b.used >= b.limit))
      throw new SourceUnavailable(source, 'subrequest budget spent')
    if (opts.until !== undefined && (opts.now ?? Date.now)() >= opts.until) throw new SourceUnavailable(source, 'out of time')
    calls++
    used[source]++
    for (const b of opts.shared ?? []) b.used++
    opts.onCall?.(source)
    let res: Response
    try {
      res = await opts.fetch(url, {
        headers: { ...headers, 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(opts.timeoutMs),
      })
    } catch {
      down.add(source)
      throw new SourceUnavailable(source, 'network error or timeout')
    }
    if (res.status === 404) return null
    if (!res.ok) {
      if (res.status === 429 || res.status >= 500) down.add(source)
      throw new SourceUnavailable(source, `HTTP ${res.status}`)
    }
    try {
      return await res.json()
    } catch {
      throw new SourceUnavailable(source, 'response was not JSON')
    }
  }

  return {
    getJson(source, url, headers = {}) {
      let p = memo.get(url)
      if (!p) {
        p = call(source, url, headers)
        memo.set(url, p)
      }
      return p
    },
  }
}
