// Owns: tests at the plan, day and cron seams — guarded plan versions, the day view built from the materialised
// targets, and the nightly dispatch's once-per-local-date idempotency. Baseline from SPEC §2/§3/§6 (plan v1, 95.1 kg).
import { ReminderKind, type ReminderPrefs } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { runCron } from '../src/cron'
import { createDb, plan_versions, profile, settings, weight_logs } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { getDay } from '../src/modules/day'
import { listEvents } from '../src/modules/events'
import { createVersion } from '../src/modules/plan'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []

/** Deps with the clock pinned to `iso`. */
const at = (iso: string, actor: Deps['actor'] = 'user'): Deps => ({
  db,
  env,
  now: () => new Date(iso),
  actor,
  waitUntil: (p) => void pending.push(p.catch(() => undefined)),
})

/** Plan v1 (SPEC §6): 1,400 kcal floor, 130 g protein, 45 g fat, 30 g fibre, carbs the remainder (118.75 g). */
const baseline = { kcal: 1400, protein_g: 130, carbs_g: 118.75, fat_g: 45, fibre_g: 30, water_ml: 3000, steps: 8000 }
const reminders = Object.fromEntries(ReminderKind.options.map((k) => [k, { enabled: true, time: null }])) as ReminderPrefs

beforeAll(async () => {
  await db.batch([
    db.insert(profile).values({
      height_cm: 165.1,
      sex: 'male',
      goal_weight_kg: 65,
      goal_date: '2027-08-04',
      start_weight_kg: 95.1,
      start_date: '2026-09-26',
    }),
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
      targets: { defaults: baseline, overrides: {} },
      forecast: { finish_date: '2027-06-17', weekly_rate_kg: 1.046, band: { low: 0.837, high: 1.256 }, tdee_est: 2551 },
    }),
    db.insert(weight_logs).values({ date: '2026-09-26', weight_kg: 95.1 }),
  ])
})

afterEach(async () => {
  await Promise.all(pending.splice(0))
})

describe('plan versions', () => {
  it('rejects a 1,350 kcal target (below the 1,400 floor), keeps the plan and records the rejection', async () => {
    const deps = at('2026-10-05T15:00:00.000Z', 'mcp')
    const result = await createVersion(deps, {
      changes: [{ field: 'kcal', weekday: null, from: 1400, to: 1350, reason: 'Faster loss' }],
      reason: 'Coach review',
    })

    expect(result.plan_version).toBeNull()
    expect(result.rejected).toEqual([expect.objectContaining({ rule: 'calorie_floor' })])
    const { events } = await listEvents(deps, {})
    expect(events.at(-1)).toMatchObject({ kind: 'note', actor: 'mcp', summary: expect.stringContaining('1400 kcal floor') })
  })
})

describe('day view', () => {
  it('shows the baseline day 2026-09-26: 1,400 kcal target and 95.1 kg', async () => {
    const day = await getDay(at('2026-10-05T15:00:00.000Z'), '2026-09-26')

    expect(day.targets?.kcal).toBe(1400)
    expect(day.remaining?.kcal).toBe(1400)
    expect(day.weight).toEqual({ raw_kg: 95.1, trend_kg: 95.1, change_7d_kg: null })
  })
})

describe('cron dispatch', () => {
  it("runs 'nightly' once per Edmonton local date, only after 00:30", async () => {
    // 2026-10-05 is MDT (UTC−6): 06:00Z = 00:00 local, 07:00Z = 01:00 local.
    const beforeWindow = await runCron(at('2026-10-05T06:00:00.000Z', 'ai'))
    const first = await runCron(at('2026-10-05T07:00:00.000Z', 'ai'))
    const again = await runCron(at('2026-10-05T07:05:00.000Z', 'ai'))
    const nextNight = await runCron(at('2026-10-06T07:00:00.000Z', 'ai'))

    expect(beforeWindow.ran).not.toContain('nightly')
    expect(first.ran).toContain('nightly')
    expect(again.ran).not.toContain('nightly')
    expect(nextNight.ran).toContain('nightly')
    expect([...first.failed, ...nextNight.failed]).toEqual([])
  })
})
