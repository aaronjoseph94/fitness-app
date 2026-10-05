// Owns: the job queue (`ai_jobs`: queued → running → done | failed, with a lease) — enqueue, run soon after the
// response (waitUntil, 25 s deadline), the handler registry, and the 5-minute sweep.
// Interface:
//   registerJobHandler(type, { fetches, run })   one handler per JobType, registered by the module that owns the work
//   jobInsert(deps, input) → { id, statement }   enqueue inside the caller's db.batch (then runSoon after it commits)
//   enqueue(deps, input)   → AiJob row            enqueue on its own
//   runSoon(deps, id)                             run in waitUntil after the response; no-op when no handler exists yet
//   runJob(deps, id)       → JobOutcome           run one job now (lease, deadline, retry/backoff, fail after 3 attempts)
//   sweep(deps, { max, fetch_budget })            requeue expired leases, then run due jobs within the subrequest budget
//   getJob(deps, id)       → AiJob                GET /api/jobs/:id
// A job type with no registered handler is left queued untouched (its handler may arrive in a later phase).
import { AiJob, type JobPayload, type JobType } from '@fitness/shared/schemas'
import { and, asc, desc, eq, inArray, lt, lte } from 'drizzle-orm'
import { ai_jobs, type Row } from '../../db'
import type { Deps } from '../../lib/deps'
import { notFound } from '../../lib/http-error'
import { handlerFor, registeredTypes } from './lib/registry'
import { runJob, type JobOutcome } from './lib/runner'

export { registerJobHandler, type JobContext, type JobHandler, type JobMeta } from './lib/registry'
export { runJob, DEADLINE_MS, MAX_ATTEMPTS, type JobOutcome } from './lib/runner'

export type JobRow = Row<typeof ai_jobs>

export interface EnqueueInput<T extends JobType> {
  type: T
  payload: JobPayload<T>
  /** Higher runs first (user-facing work > nightly summaries). Default 0. */
  priority?: number
  /** Earliest start (UTC instant); default now. */
  run_after?: string
  id?: string
}

/** Default external-fetch budget per sweep: the free plan allows 50 subrequests per invocation; keep headroom. */
export const SWEEP_FETCH_BUDGET = 40

/** An insert for one queued job, to run inside the caller's db.batch. */
export function jobInsert<T extends JobType>(deps: Deps, input: EnqueueInput<T>) {
  const id = input.id ?? crypto.randomUUID()
  const now = deps.now().toISOString()
  const statement = deps.db.insert(ai_jobs).values({
    id,
    type: input.type,
    status: 'queued',
    priority: input.priority ?? 0,
    payload: input.payload,
    run_after: input.run_after ?? now,
    created_at: now,
    updated_at: now,
  })
  return { id, statement }
}

/** Queue one job on its own and return its row. */
export async function enqueue<T extends JobType>(deps: Deps, input: EnqueueInput<T>): Promise<JobRow> {
  const { id, statement } = jobInsert(deps, input)
  await statement
  const [row] = await deps.db.select().from(ai_jobs).where(eq(ai_jobs.id, id))
  return row!
}

/** Run a job after the response (ctx.waitUntil). Errors are recorded on the job row, never thrown at the caller. */
export function runSoon(deps: Deps, id: string): void {
  deps.waitUntil(
    runJob(deps, id).catch((e: unknown) => {
      console.error(`job ${id} crashed outside its handler`, e)
    }),
  )
}

export type SweepResult = { requeued: number; ran: JobOutcome[]; deferred: number }

/**
 * The 5-minute sweep:
 *   1. running jobs whose lease_until < now → queued (their waitUntil died)
 *   2. up to `max` queued jobs with run_after ≤ now and a registered handler, priority DESC then run_after ASC,
 *      run one after another while Σ handler.fetches ≤ fetch_budget; the rest wait for the next sweep.
 */
export async function sweep(deps: Deps, opts: { max?: number; fetch_budget?: number } = {}): Promise<SweepResult> {
  const max = opts.max ?? 5
  let budget = opts.fetch_budget ?? SWEEP_FETCH_BUDGET
  const now = deps.now().toISOString()

  const requeued = await deps.db
    .update(ai_jobs)
    .set({ status: 'queued', lease_until: null, updated_at: now })
    .where(and(eq(ai_jobs.status, 'running'), lt(ai_jobs.lease_until, now)))
    .returning({ id: ai_jobs.id })

  const types = registeredTypes()
  if (types.length === 0) return { requeued: requeued.length, ran: [], deferred: 0 }

  const due = await deps.db
    .select({ id: ai_jobs.id, type: ai_jobs.type })
    .from(ai_jobs)
    .where(and(eq(ai_jobs.status, 'queued'), lte(ai_jobs.run_after, now), inArray(ai_jobs.type, types)))
    .orderBy(desc(ai_jobs.priority), asc(ai_jobs.run_after))
    .limit(max)

  const ran: JobOutcome[] = []
  let deferred = 0
  for (const job of due) {
    const cost = handlerFor(job.type)?.fetches ?? 0
    if (cost > budget) {
      deferred++
      continue
    }
    budget -= cost
    ran.push(await runJob(deps, job.id))
  }
  return { requeued: requeued.length, ran, deferred }
}

/** One job as GET /api/jobs/:id returns it (payload and result parsed with the job type's schemas). */
export async function getJob(deps: Deps, id: string): Promise<AiJob> {
  const [row] = await deps.db.select().from(ai_jobs).where(eq(ai_jobs.id, id))
  if (!row) throw notFound('Job')
  return AiJob.parse({
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    type: row.type,
    status: row.status,
    payload: row.payload,
    result: row.result ?? null,
    provider: row.provider,
    model: row.model,
    attempts: row.attempts,
    error: row.error,
    latency_ms: row.latency_ms,
    tokens_in: row.tokens_in,
    tokens_out: row.tokens_out,
    run_after: row.run_after,
    lease_until: row.lease_until,
  })
}
