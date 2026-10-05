// Owns: the typed errors the router throws (deadline, fetch budget, no provider left) and the internal per-attempt
// failure that drives retry vs failover. Messages never include prompt or reply text.

/** The call ran out of time. The job runner should set the job back to `queued` and let the sweep retry it. */
export class DeadlineError extends Error {
  override readonly name = 'DeadlineError'
  constructor(readonly deadlineMs: number) {
    super(`LLM call passed its ${deadlineMs} ms deadline`)
  }
}

/** The invocation's external-fetch budget is spent (Workers Free allows 50 subrequests). Requeue the job. */
export class BudgetError extends Error {
  override readonly name = 'BudgetError'
  constructor(readonly limit: number) {
    super(`External fetch budget of ${limit} per invocation is spent`)
  }
}

export type FailureReason =
  | 'no_key'
  | 'quota'
  | 'cooldown'
  | 'rate_limited'
  | 'server'
  | 'timeout'
  | 'network'
  | 'client'
  | 'blocked'
  | 'invalid_output'

/** Why one model in the chain was skipped or failed. */
export interface ProviderFailure {
  provider: string
  model: string
  reason: FailureReason
  status?: number
}

/**
 * Every model in the chain was skipped or failed. `quotaOnly` means nothing was tried because of daily quotas or
 * cooldowns: retry after the quota resets rather than marking the job failed.
 */
export class ProvidersExhaustedError extends Error {
  override readonly name = 'ProvidersExhaustedError'
  readonly quotaOnly: boolean
  constructor(readonly failures: ProviderFailure[]) {
    super(
      `No LLM provider could answer: ${failures.map((f) => `${f.provider}/${f.model}=${f.reason}${f.status ? `(${f.status})` : ''}`).join(', ') || 'empty chain'}`,
    )
    const waiting = (f: ProviderFailure) => f.reason === 'quota' || f.reason === 'cooldown'
    this.quotaOnly = failures.some(waiting) && failures.every((f) => waiting(f) || f.reason === 'no_key')
  }
}

/** One attempt failed. `retryAfterMs` comes from Retry-After or Gemini's RetryInfo. Internal to the module. */
export class AttemptFailure extends Error {
  constructor(
    readonly reason: Exclude<FailureReason, 'no_key' | 'quota' | 'cooldown'>,
    readonly status?: number,
    readonly retryAfterMs?: number,
    /** Provider error code (e.g. RESOURCE_EXHAUSTED), safe to log. */
    readonly code?: string,
  ) {
    super(`${reason}${status ? ` ${status}` : ''}${code ? ` ${code}` : ''}`)
  }

  get retryable(): boolean {
    return (
      this.reason === 'rate_limited' ||
      this.reason === 'server' ||
      this.reason === 'timeout' ||
      this.reason === 'network'
    )
  }
}
