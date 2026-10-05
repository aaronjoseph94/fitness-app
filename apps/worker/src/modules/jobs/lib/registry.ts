// Owns: the job handler registry — one handler per job type, registered by the module that owns that work
// (plan registers plan_reforecast; phase 2 adds meal_analysis, day_adjustment, …). A type with no handler stays queued.
import type { JobOutput, JobPayload, JobType } from '@fitness/shared/schemas'
import type { Deps } from '../../../lib/deps'

/** What a handler receives: the leased job with its validated payload, and the attempt's deadline signal. */
export interface JobContext<T extends JobType> {
  id: string
  type: T
  payload: JobPayload<T>
  /** Attempts so far, including this one. */
  attempts: number
  /** Aborts at the 25 s deadline; pass it to every fetch. */
  signal: AbortSignal
}

/** Provider bookkeeping stored on the job row (LLM jobs; engine jobs leave it empty). */
export interface JobMeta {
  provider?: string
  model?: string
  tokens_in?: number
  tokens_out?: number
}

export interface JobHandler<T extends JobType> {
  /** External fetches (subrequests) one run may make; the sweep's budget (free plan: 50 per invocation) counts them. */
  fetches: number
  /** Do the work; the output is validated with JobOutputs[type] and stored in ai_jobs.result. Throw to fail the attempt. */
  run: (deps: Deps, job: JobContext<T>) => Promise<{ output: JobOutput<T>; meta?: JobMeta }>
}

// Handlers are stored with their type erased; registerJobHandler keeps the pairing type-safe at the call site.
const handlers = new Map<JobType, JobHandler<JobType>>()

/** Register (or replace) the handler for a job type. Call at module scope of the owning module. */
export function registerJobHandler<T extends JobType>(type: T, handler: JobHandler<T>): void {
  handlers.set(type, handler as unknown as JobHandler<JobType>)
}

export function handlerFor(type: string): JobHandler<JobType> | undefined {
  return handlers.get(type as JobType)
}

export function registeredTypes(): JobType[] {
  return [...handlers.keys()]
}
