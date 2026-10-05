// Owns: tests at the jobs seam (modules/jobs index) — an ordinary handler error is retried with backoff (1, 2 min) and
// failed at the 3rd attempt, JobFailed fails at once, and the sweep requeues a running job whose lease expired only
// while it has attempts left (a job that kills its isolate must not loop forever).
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { ai_jobs, createDb } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { JobFailed, MAX_ATTEMPTS, MAX_REQUEUES, registerJobHandler, runJob, sweep } from '..'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
const NOW = '2026-10-05T15:00:00.000Z'
const at = (now = NOW): Deps => ({ db, env, now: () => new Date(now), actor: 'ai', waitUntil: (p) => void pending.push(p.catch(() => undefined)) })
afterEach(async () => {
  await Promise.all(pending.splice(0))
})
const job = async (id: string) => (await db.select().from(ai_jobs).where(eq(ai_jobs.id, id)))[0]!

/** What the plan_reforecast handler throws next (this file registers its own handler for the type). */
let failWith: Error = new Error('boom')
registerJobHandler('plan_reforecast', {
  fetches: 0,
  run: async () => {
    throw failWith
  },
})

describe('runJob', () => {
  it('requeues an ordinary error after 1 min, then 2 min, and fails it at the 3rd attempt', async () => {
    failWith = new Error('boom')
    const id = crypto.randomUUID()
    await db.insert(ai_jobs).values({ id, type: 'plan_reforecast', status: 'queued', payload: { date: '2026-10-04' }, run_after: NOW })

    expect(await runJob(at(), id)).toMatchObject({ status: 'queued', error: 'boom' })
    expect(await job(id)).toMatchObject({ attempts: 1, run_after: '2026-10-05T15:01:00.000Z' })
    expect(await runJob(at('2026-10-05T15:01:00.000Z'), id)).toMatchObject({ status: 'queued' })
    expect(await job(id)).toMatchObject({ attempts: 2, run_after: '2026-10-05T15:03:00.000Z' })
    expect(await runJob(at('2026-10-05T15:03:00.000Z'), id)).toMatchObject({ status: 'failed', error: 'boom' })
    expect(await job(id)).toMatchObject({ attempts: MAX_ATTEMPTS, status: 'failed' })
  })

  it('fails a JobFailed at once', async () => {
    failWith = new JobFailed('nothing to work on')
    const id = crypto.randomUUID()
    await db.insert(ai_jobs).values({ id, type: 'plan_reforecast', status: 'queued', payload: { date: '2026-10-04' }, run_after: NOW })

    expect(await runJob(at(), id)).toMatchObject({ status: 'failed', error: 'nothing to work on' })
    expect(await job(id)).toMatchObject({ attempts: 1, status: 'failed' })
  })
})

describe('sweep: expired leases', () => {
  // max 0: the sweep requeues or fails expired leases but runs no due job, so the row shows what the sweep decided.
  const running = (attempts: number) => ({
    id: crypto.randomUUID(),
    type: 'weekly_review' as const,
    status: 'running' as const,
    attempts,
    payload: { week_start: '2026-09-28' },
    run_after: '2026-10-05T14:00:00.000Z',
    lease_until: '2026-10-05T14:00:30.000Z',
  })

  it(`fails a job whose lease expired on its ${MAX_REQUEUES}th attempt instead of running it again`, async () => {
    const row = running(MAX_REQUEUES)
    await db.insert(ai_jobs).values(row)

    await sweep(at(), { max: 0 })

    expect(await job(row.id)).toMatchObject({ status: 'failed', attempts: MAX_REQUEUES, error: 'lease_expired_max_attempts', lease_until: null })
  })

  it('requeues a job whose lease expired with attempts left', async () => {
    const row = running(2)
    await db.insert(ai_jobs).values(row)

    const result = await sweep(at(), { max: 0 })

    expect(result.requeued).toBe(1)
    expect(await job(row.id)).toMatchObject({ status: 'queued', attempts: 2, lease_until: null })
  })
})
