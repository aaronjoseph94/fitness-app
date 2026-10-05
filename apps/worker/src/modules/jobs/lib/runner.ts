// Owns: running one job — lease it (conditional UPDATE … RETURNING, so two runners never both get it), call its handler
// under a 25 s deadline, validate the output, and complete it, requeue it (later, or with backoff) or fail it, by what
// went wrong (see `classify`).
import { JobOutputs, JobPayloads, JobType } from '@fitness/shared/schemas'
import { and, eq, lte, sql } from 'drizzle-orm'
import { ai_jobs } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { BudgetError, DeadlineError as LlmDeadlineError, ProvidersExhaustedError } from '../../llm'
import { handlerFor } from './registry'

/** Per-attempt deadline (waitUntil allows 30 s). */
export const DEADLINE_MS = 25_000
/** A running job's lease; the sweep requeues a job still `running` after it. */
export const LEASE_MS = 30_000
/** Attempts before a job that keeps throwing ordinary errors is marked failed. */
export const MAX_ATTEMPTS = 3
/** Attempts before a job that keeps running out of time, budget or quota is marked failed. */
export const MAX_REQUEUES = 6

export type JobOutcome = { id: string; status: 'done' | 'queued' | 'failed' | 'skipped'; error?: string }

const MINUTE_MS = 60_000
const iso = (ms: number) => new Date(ms).toISOString()

/** Backoff before retry n (n = attempts so far): 1, 2, 4 … minutes. */
const backoffMs = (attempts: number) => MINUTE_MS * 2 ** Math.max(0, attempts - 1)

class DeadlineError extends Error {}

/**
 * Throw from a handler to requeue the job after `afterMs` (it still counts as an attempt; failed once attempts reach
 * MAX_REQUEUES). For "not now": a source is rate-limited, or the work waits for something else.
 */
export class RetryLater extends Error {
  override readonly name = 'RetryLater'
  constructor(
    message: string,
    readonly afterMs: number,
  ) {
    super(message)
  }
}

/** Throw from a handler to fail the job at once: retrying cannot help (bad input, nothing to work on). */
export class JobFailed extends Error {
  override readonly name = 'JobFailed'
}

type Verdict = { kind: 'requeue'; afterMs: number; cap: number } | { kind: 'fail' }

/**
 * What to do after a failed attempt:
 *   the job's 25 s deadline, or the router's DeadlineError    → requeue in 1 min        (up to MAX_REQUEUES attempts)
 *   BudgetError (the invocation's 50 subrequests are spent)    → requeue now: next sweep (up to MAX_REQUEUES)
 *   ProvidersExhaustedError with quotaOnly (daily quotas)      → requeue in 60 min       (up to MAX_REQUEUES)
 *   RetryLater(afterMs) / JobFailed                            → as they say
 *   anything else (incl. no provider answering)                → backoff 1, 2, 4 min, failed at MAX_ATTEMPTS
 * A handler that should not wait for providers (meal_analysis: Aaron is looking at the meal) throws JobFailed itself.
 */
function classify(e: unknown, attempts: number): Verdict {
  if (e instanceof DeadlineError || e instanceof LlmDeadlineError) return { kind: 'requeue', afterMs: MINUTE_MS, cap: MAX_REQUEUES }
  if (e instanceof BudgetError) return { kind: 'requeue', afterMs: 0, cap: MAX_REQUEUES }
  if (e instanceof ProvidersExhaustedError && e.quotaOnly) return { kind: 'requeue', afterMs: 60 * MINUTE_MS, cap: MAX_REQUEUES }
  if (e instanceof RetryLater) return { kind: 'requeue', afterMs: e.afterMs, cap: MAX_REQUEUES }
  if (e instanceof JobFailed) return { kind: 'fail' }
  return { kind: 'requeue', afterMs: backoffMs(attempts), cap: MAX_ATTEMPTS }
}

/** Aborts `controller` and rejects at the deadline; `clear()` disarms it once the handler has settled. */
function deadline(controller: AbortController): { expired: Promise<never>; clear: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new DeadlineError(`Job exceeded the ${DEADLINE_MS / 1000} s deadline`))
    }, DEADLINE_MS)
  })
  return { expired, clear: () => clearTimeout(timer) }
}

/**
 * Run job `id` now if it is queued, due, and its type has a handler; otherwise leave it as it is ('skipped').
 *   lease:    status queued → running, attempts + 1, lease_until = now + 30 s (only if still queued and due)
 *   success:  status done, result = JobOutputs[type].parse(output), latency_ms, provider bookkeeping
 *   failure:  requeued (status queued, run_after later) or failed, by `classify`; the error text is kept either way.
 *             An invalid payload fails at once (retrying cannot fix it).
 */
export async function runJob(deps: Deps, id: string): Promise<JobOutcome> {
  const [peek] = await deps.db.select({ type: ai_jobs.type }).from(ai_jobs).where(eq(ai_jobs.id, id))
  const handler = peek ? handlerFor(peek.type) : undefined
  if (!peek || !handler) return { id, status: 'skipped' }

  const startedMs = deps.now().getTime()
  const [job] = await deps.db
    .update(ai_jobs)
    .set({
      status: 'running',
      attempts: sql`${ai_jobs.attempts} + 1`,
      lease_until: iso(startedMs + LEASE_MS),
      updated_at: iso(startedMs),
    })
    .where(and(eq(ai_jobs.id, id), eq(ai_jobs.status, 'queued'), lte(ai_jobs.run_after, iso(startedMs))))
    .returning()
  if (!job) return { id, status: 'skipped' }
  const attempts = job.attempts

  const type = JobType.parse(job.type)
  const finish = (set: Partial<typeof ai_jobs.$inferInsert>) =>
    deps.db
      .update(ai_jobs)
      .set({ ...set, lease_until: null, updated_at: deps.now().toISOString() })
      .where(eq(ai_jobs.id, id))

  const payload = JobPayloads[type].safeParse(job.payload)
  if (!payload.success) {
    const error = `Invalid payload: ${payload.error.message}`.slice(0, 1000)
    await finish({ status: 'failed', error })
    return { id, status: 'failed', error }
  }

  const controller = new AbortController()
  const timeout = deadline(controller)
  try {
    const { output, meta } = await Promise.race([
      // A job's writes are the AI's, whoever queued it (Actor 'ai' on events and rows).
      handler.run({ ...deps, actor: 'ai' }, { id, type, payload: payload.data, attempts, signal: controller.signal }),
      timeout.expired,
    ])
    const result = JobOutputs[type].parse(output)
    await finish({
      status: 'done',
      result,
      error: null,
      latency_ms: Math.max(0, deps.now().getTime() - startedMs),
      provider: meta?.provider ?? null,
      model: meta?.model ?? null,
      tokens_in: meta?.tokens_in ?? null,
      tokens_out: meta?.tokens_out ?? null,
    })
    return { id, status: 'done' }
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 1000)
    const verdict = classify(e, attempts)
    if (verdict.kind === 'fail' || attempts >= verdict.cap) {
      await finish({ status: 'failed', error })
      return { id, status: 'failed', error }
    }
    await finish({ status: 'queued', error, run_after: iso(deps.now().getTime() + verdict.afterMs) })
    return { id, status: 'queued', error }
  } finally {
    timeout.clear()
  }
}
