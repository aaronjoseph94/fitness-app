// Owns: rail tests at the fasting seam — two fasts a calendar month counted by each fast's fast day (engine fastDay: a
// 19:00 → 19:00 fast makes the next day the fast day), the same cap on fasts Ask AI or Claude start, an AI start at
// most 24 h in the past, one running fast even when two starts race, and a missed fast's past day corrected.
// Rails from SPEC §2 (two 24 h fasts a month) and §6 (floor 1,400 kcal).
import { ReminderKind, type ReminderPrefs } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { eq, isNull } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createDb, daily_targets, fast_logs, plan_versions, profile, settings } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { cancelFast, fastDaysIn, planFast, startFast } from '../src/modules/fasting'
import { ensureTargetsThrough } from '../src/modules/plan'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
/** Monday 2026-10-05 09:00 MDT. */
const NOW = '2026-10-05T15:00:00.000Z'
const at = (actor: Deps['actor'] = 'user', now = NOW): Deps => ({
  db,
  env,
  now: () => new Date(now),
  actor,
  waitUntil: (p) => void pending.push(p.catch(() => undefined)),
})
afterEach(async () => {
  await Promise.all(pending.splice(0))
})
const reminders = Object.fromEntries(ReminderKind.options.map((k) => [k, { enabled: true, time: null }])) as ReminderPrefs

beforeAll(async () => {
  await db.batch([
    db.insert(profile).values({ height_cm: 165.1, sex: 'male', goal_weight_kg: 65, goal_date: '2027-08-04', start_weight_kg: 95.1, start_date: '2026-09-26' }),
    db.insert(settings).values({
      calorie_floor: 1400,
      calorie_ceiling: 1700,
      protein_min_g: 130,
      fat_min_g: 45,
      fibre_target_g: 30,
      water_target_ml: 3000,
      training_days: ['mon', 'tue', 'wed', 'thu'],
      reminders,
    }),
    db.insert(plan_versions).values({
      version: 1,
      active: true,
      created_by: 'user',
      reason: 'Baseline rails from doctor and dietitian',
      diff: [],
      targets: { defaults: { kcal: 1400, protein_g: 130, carbs_g: 119, fat_g: 45, fibre_g: 30, water_ml: 3000, steps: 8000 }, overrides: {} },
    }),
  ])
})

describe('two fasts a calendar month, counted by fast day', () => {
  it('fasts from 30 Oct 19:00, 31 Oct 19:00, 10 Nov and 20 Nov would give November three 0 kcal days: the last is refused', async () => {
    await planFast(at(), { id: crypto.randomUUID(), started_at: '2026-10-31T01:00:00.000Z' }) // fast day Sat 31 Oct
    await planFast(at(), { id: crypto.randomUUID(), started_at: '2026-11-01T01:00:00.000Z' }) // fast day Sun 1 Nov
    await planFast(at(), { id: crypto.randomUUID(), started_at: '2026-11-11T02:00:00.000Z' }) // 10 Nov 19:00 MST → 11 Nov

    await expect(planFast(at(), { id: crypto.randomUUID(), started_at: '2026-11-21T02:00:00.000Z' })).rejects.toMatchObject({
      status: 422,
      code: 'fasting_pattern',
    })
    expect((await fastDaysIn(at(), { from: '2026-11-01', to: '2026-11-30' })).map((f) => f.date)).toEqual(['2026-11-01', '2026-11-11'])
  })
})

describe('fasts started by Ask AI or Claude', () => {
  it('Ask AI cannot start a third December fast; Aaron may start one himself', async () => {
    await planFast(at(), { id: crypto.randomUUID(), started_at: '2026-12-03T02:00:00.000Z' }) // fast day 3 Dec
    await planFast(at(), { id: crypto.randomUUID(), started_at: '2026-12-10T02:00:00.000Z' }) // fast day 10 Dec
    const third = '2026-12-20T16:00:00.000Z'

    await expect(startFast(at('ai', third), { id: crypto.randomUUID(), started_at: third })).rejects.toMatchObject({ status: 422, code: 'fasting_pattern' })
    await expect(startFast(at('user', third), { id: crypto.randomUUID(), started_at: third })).resolves.toMatchObject({ started_at: third })
  })

  it('an AI start may not be backdated more than 24 h (400)', async () => {
    const now = '2027-01-20T16:00:00.000Z'
    const started_at = '2027-01-19T15:00:00.000Z' // 25 h earlier

    await expect(startFast(at('mcp', now), { id: crypto.randomUUID(), started_at })).rejects.toMatchObject({ status: 400 })
  })
})

describe('one running fast', () => {
  it('two starts tapped at once with different ids leave one running fast; the other is 409 fast_active', async () => {
    const now = '2027-02-10T15:00:00.000Z'
    const ids = [crypto.randomUUID(), crypto.randomUUID()]
    const results = await Promise.allSettled(ids.map((id) => startFast(at('user', now), { id, started_at: now })))

    const running = await db.select().from(fast_logs).where(isNull(fast_logs.ended_at))
    expect(running.filter((f) => ids.includes(f.id))).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected').map((r) => (r as PromiseRejectedResult).reason)).toEqual([
      expect.objectContaining({ status: 409, code: 'fast_active' }),
    ])
    // A replay of the winning id is still a no-op.
    const winner = running.find((f) => ids.includes(f.id))!
    await expect(startFast(at('user', now), { id: winner.id, started_at: now })).resolves.toMatchObject({ id: winner.id })
  })
})

describe('a missed fast', () => {
  it("removing a skipped planned fast after its day gives that past day back its targets", async () => {
    // Planned Wed 2026-09-30 19:00 MDT → fast day Thu 1 Oct; never started by a tap, never ended: skipped.
    const id = crypto.randomUUID()
    await planFast(at('user', '2026-09-28T15:00:00.000Z'), { id, started_at: '2026-10-01T01:00:00.000Z' })
    await ensureTargetsThrough(at('user', '2026-09-28T15:00:00.000Z'), '2026-10-05')
    const day = async () => (await db.select().from(daily_targets).where(eq(daily_targets.date, '2026-10-01')))[0]
    expect(await day()).toMatchObject({ is_fast_day: true, kcal: 0 })

    await cancelFast(at(), id)

    expect(await day()).toMatchObject({ is_fast_day: false, kcal: 1400 })
  })
})
