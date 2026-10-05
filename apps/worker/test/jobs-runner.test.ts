// Owns: tests at the jobs seam (modules/jobs index: runJob, sweep, enqueue, registerJobHandler, registerSweepStep) for
// the queue's life cycle — a job still running at the 25 s deadline goes back to queued for 1 min (failed on its 6th
// attempt), two runners or two sweeps never both run one job, due jobs run priority first then oldest run_after first,
// a poison job or a job type without a handler never blocks the rest, a sweep step's jobs run in the same sweep while
// a handler's wait for the next, and a runner whose lease expired cannot overwrite the attempt that took over.
// This file registers its own plan_reforecast handler (payload { date }, output a Forecast) and drives it per test.
import type { Forecast } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ai_jobs, createDb } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { enqueue, registerJobHandler, registerSweepStep, runJob, sweep, type JobContext } from '../src/modules/jobs'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
const NOW = '2026-10-05T15:00:00.000Z' // Mon 09:00 MDT
const at = (now = NOW): Deps => ({ db, env, now: () => new Date(now), actor: 'ai', waitUntil: (p) => void pending.push(p.catch(() => undefined)) })
const job = async (id: string) => (await db.select().from(ai_jobs).where(eq(ai_jobs.id, id)))[0]!

const FORECAST: Forecast = { finish_date: '2027-06-17', weekly_rate_kg: 1.046, band: { low: 0.837, high: 1.256 }, tdee_est: 2551 }

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Each handler call (job id and its attempt number), in order. */
let calls: { id: string; attempts: number }[] = []
/** What the handler does for the current test. */
let behaviour: (job: JobContext<'plan_reforecast'>) => Promise<Forecast> = async () => FORECAST
registerJobHandler('plan_reforecast', {
  fetches: 0,
  run: async (_deps, job) => {
    calls.push({ id: job.id, attempts: job.attempts })
    return { output: await behaviour(job) }
  },
})

/** A sweep step that queues one job when armed (to show a step's jobs run in the same sweep). */
let stepQueues: string | null = null
registerSweepStep('test_queue_one', async (deps) => {
  if (!stepQueues) return 0
  await enqueue(deps, { id: stepQueues, type: 'plan_reforecast', payload: { date: '2026-10-04' } })
  stepQueues = null
  return 1
})

const queued = (over: Partial<typeof ai_jobs.$inferInsert> = {}) => ({
  id: crypto.randomUUID(),
  type: 'plan_reforecast',
  status: 'queued' as const,
  payload: { date: '2026-10-04' },
  run_after: NOW,
  ...over,
})

beforeEach(async () => {
  await db.delete(ai_jobs)
  calls = []
  behaviour = async () => FORECAST
  stepQueues = null
})
afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(pending.splice(0))
})

describe('the 25 s deadline', () => {
  it('a job still running at 25 s goes back to queued for 1 min with its signal aborted', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const row = queued()
    await db.insert(ai_jobs).values(row)
    const started = deferred<AbortSignal>()
    behaviour = (j) => {
      started.resolve(j.signal)
      return new Promise<Forecast>(() => undefined) // never settles
    }

    const outcome = runJob(at(), row.id)
    const signal = await started.promise
    await vi.advanceTimersByTimeAsync(24_999)
    expect(signal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    expect(await outcome).toEqual({ id: row.id, status: 'queued', error: 'Job exceeded the 25 s deadline' })
    expect(signal.aborted).toBe(true)
    expect(await job(row.id)).toMatchObject({
      status: 'queued',
      attempts: 1,
      run_after: '2026-10-05T15:01:00.000Z',
      lease_until: null,
      error: 'Job exceeded the 25 s deadline',
    })
  })

  it('the deadline on the 6th attempt fails the job', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const row = queued({ attempts: 5 })
    await db.insert(ai_jobs).values(row)
    const started = deferred<void>()
    behaviour = () => {
      started.resolve()
      return new Promise<Forecast>(() => undefined)
    }

    const outcome = runJob(at(), row.id)
    await started.promise
    await vi.advanceTimersByTimeAsync(25_000)

    expect(await outcome).toMatchObject({ status: 'failed', error: 'Job exceeded the 25 s deadline' })
    expect(await job(row.id)).toMatchObject({ status: 'failed', attempts: 6, lease_until: null })
  })

  it('a job that finishes in time is done, with no timer left to fire', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const row = queued()
    await db.insert(ai_jobs).values(row)

    expect(await runJob(at(), row.id)).toEqual({ id: row.id, status: 'done' })
    expect(vi.getTimerCount()).toBe(0)
    expect(await job(row.id)).toMatchObject({ status: 'done', attempts: 1, result: FORECAST, error: null, lease_until: null })
  })
})

describe('leases', () => {
  it('two runners racing for one queued job: one runs it, the other skips', async () => {
    const row = queued()
    await db.insert(ai_jobs).values(row)

    const outcomes = await Promise.all([runJob(at(), row.id), runJob(at(), row.id)])

    expect(outcomes.map((o) => o.status).sort()).toEqual(['done', 'skipped'])
    expect(calls).toEqual([{ id: row.id, attempts: 1 }])
  })

  it('two sweeps racing run each due job once', async () => {
    const rows = [queued(), queued(), queued()]
    await db.insert(ai_jobs).values(rows)

    const [a, b] = await Promise.all([sweep(at()), sweep(at())])

    const ids = rows.map((r) => r.id).sort()
    expect(calls.map((c) => c.id).sort()).toEqual(ids)
    expect([...a.ran, ...b.ran].filter((o) => o.status === 'done').map((o) => o.id).sort()).toEqual(ids)
  })

  it('a job not yet due is not leased', async () => {
    const row = queued({ run_after: '2026-10-05T15:00:01.000Z' })
    await db.insert(ai_jobs).values(row)

    expect(await runJob(at(), row.id)).toEqual({ id: row.id, status: 'skipped' })
    expect(await job(row.id)).toMatchObject({ status: 'queued', attempts: 0 })
  })

  it('a runner whose lease expired cannot overwrite the attempt that took over', async () => {
    // Attempt 1 leases at 15:00:00 (lease to 15:00:30) and stalls; at 15:00:31 the sweep requeues it and attempt 2
    // leases it (lease to 15:01:01). Then attempt 1 finishes: the row must still be attempt 2's.
    const row = queued()
    await db.insert(ai_jobs).values(row)
    const first = deferred<Forecast>()
    const second = deferred<Forecast>()
    const secondStarted = deferred<void>()
    const firstStarted = deferred<void>()
    behaviour = (j) => {
      if (j.attempts === 1) {
        firstStarted.resolve()
        return first.promise
      }
      secondStarted.resolve()
      return second.promise
    }

    const a = runJob(at(), row.id)
    await firstStarted.promise
    expect((await sweep(at('2026-10-05T15:00:31.000Z'), { max: 0 })).requeued).toBe(1)
    const b = runJob(at('2026-10-05T15:00:31.000Z'), row.id)
    await secondStarted.promise

    first.resolve(FORECAST)
    await a
    expect(await job(row.id)).toMatchObject({ status: 'running', attempts: 2, lease_until: '2026-10-05T15:01:01.000Z' })

    second.reject(new Error('boom'))
    expect(await b).toMatchObject({ status: 'queued', error: 'boom' })
    expect(await job(row.id)).toMatchObject({ status: 'queued', attempts: 2, run_after: '2026-10-05T15:02:31.000Z' })
  })
})

describe('the sweep', () => {
  it('runs due jobs by priority, then oldest run_after first', async () => {
    const a = queued({ run_after: '2026-10-05T14:57:00.000Z' })
    const b = queued({ run_after: '2026-10-05T14:59:00.000Z' })
    const c = queued({ run_after: '2026-10-05T14:58:00.000Z' })
    const urgent = queued({ priority: 5, run_after: '2026-10-05T15:00:00.000Z' })
    const later = queued({ run_after: '2026-10-05T15:05:00.000Z' })
    await db.insert(ai_jobs).values([a, b, c, urgent, later])

    await sweep(at())

    expect(calls.map((x) => x.id)).toEqual([urgent.id, a.id, c.id, b.id])
    expect(await job(later.id)).toMatchObject({ status: 'queued', attempts: 0 })
  })

  it('a poison job is retried later and the rest still run', async () => {
    const poison = queued({ priority: 9 })
    const rest = [queued(), queued()]
    await db.insert(ai_jobs).values([poison, ...rest])
    behaviour = async (j) => {
      if (j.id === poison.id) throw new Error('poison')
      return FORECAST
    }

    const result = await sweep(at())

    expect(result.ran).toEqual([
      { id: poison.id, status: 'queued', error: 'poison' },
      { id: rest[0]!.id, status: 'done' },
      { id: rest[1]!.id, status: 'done' },
    ])
    expect(await job(poison.id)).toMatchObject({ status: 'queued', attempts: 1, run_after: '2026-10-05T15:01:00.000Z' })
    expect((await sweep(at('2026-10-05T15:00:30.000Z'))).ran).toEqual([]) // not due again yet
  })

  it('jobs of a type without a handler take none of the sweep’s slots', async () => {
    const orphans = Array.from({ length: 5 }, () => queued({ type: 'ask_ai', run_after: '2026-10-05T14:00:00.000Z' }))
    const mine = queued()
    await db.insert(ai_jobs).values([...orphans, mine])

    const result = await sweep(at(), { max: 5 })

    expect(result.ran).toEqual([{ id: mine.id, status: 'done' }])
    for (const o of orphans) expect(await job(o.id)).toMatchObject({ status: 'queued', attempts: 0 })
  })

  it('a job a sweep step queues runs in the same sweep', async () => {
    stepQueues = crypto.randomUUID()
    const id = stepQueues

    const result = await sweep(at())

    expect(result.steps.test_queue_one).toBe(1)
    expect(result.ran).toEqual([{ id, status: 'done' }])
  })

  it('a job a handler queues mid-sweep waits for the next sweep', async () => {
    const parent = queued()
    await db.insert(ai_jobs).values(parent)
    const child = crypto.randomUUID()
    behaviour = async (j) => {
      if (j.id === parent.id) await enqueue({ ...at(), actor: 'ai' }, { id: child, type: 'plan_reforecast', payload: { date: '2026-10-04' } })
      return FORECAST
    }

    expect((await sweep(at())).ran).toEqual([{ id: parent.id, status: 'done' }])
    expect(await job(child)).toMatchObject({ status: 'queued', attempts: 0 })
    expect((await sweep(at('2026-10-05T15:05:00.000Z'))).ran).toEqual([{ id: child, status: 'done' }])
  })
})
