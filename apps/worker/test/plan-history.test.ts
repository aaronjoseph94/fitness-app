// Owns: tests at the plan and settings seams for plan history — restoring an old version appends a new one (past daily
// targets stay as they were; Ask AI may not restore), and the Settings water / fibre targets reach the daily targets
// as a plan version of Aaron's. Baseline plan v1 from SPEC §6 (1,400 kcal, 3,000 ml water, 30 g fibre).
import { ReminderKind, type ReminderPrefs } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createDb, daily_targets, plan_versions, profile, settings } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { getDay } from '../src/modules/day'
import { createVersion, ensureTargetsThrough, getActivePlan, listVersions, restoreVersion } from '../src/modules/plan'
import { updateSettings } from '../src/modules/settings'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
/** Monday 2026-10-05 09:00 MDT, and Tuesday at the same time. */
const MONDAY = '2026-10-05T15:00:00.000Z'
const TUESDAY = '2026-10-06T15:00:00.000Z'
const at = (now = MONDAY, actor: Deps['actor'] = 'user'): Deps => ({
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
const targetsOn = async (date: string) => (await db.select().from(daily_targets).where(eq(daily_targets.date, date)))[0]

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

describe('restoreVersion', () => {
  it('v1 1,400 → v2 1,550 → restoring v1 the next day makes v3 at 1,400; Monday keeps its 1,550', async () => {
    await ensureTargetsThrough(at(), '2026-10-05')
    const v1 = (await getActivePlan(at())).id
    await createVersion(at(), { changes: [{ field: 'kcal', weekday: null, from: 1400, to: 1550, reason: 'More energy' }], reason: 'Aaron' })
    expect(await targetsOn('2026-10-05')).toMatchObject({ kcal: 1550 })

    const v3 = await restoreVersion(at(TUESDAY), v1)

    expect(v3).toMatchObject({ version: 3, active: true, targets: { defaults: { kcal: 1400 } } })
    expect((await listVersions(at())).map((v) => v.version)).toEqual([3, 2, 1])
    expect(await targetsOn('2026-10-05')).toMatchObject({ kcal: 1550 })
    expect(await targetsOn('2026-10-06')).toMatchObject({ kcal: 1400, plan_version_id: v3.id })
  })

  it('is not open to Ask AI (403 needs_approval)', async () => {
    const [, v2] = await listVersions(at())
    await expect(restoreVersion(at(TUESDAY, 'ai'), v2!.id)).rejects.toMatchObject({ status: 403, code: 'needs_approval' })
  })
})

describe('Settings water and fibre targets', () => {
  it('water 3,600 ml in Settings is tomorrow’s water target, as a plan version of Aaron’s', async () => {
    await updateSettings(at(TUESDAY), { settings: { water_target_ml: 3600, fibre_target_g: 35 } })

    expect((await getDay(at(TUESDAY), '2026-10-07')).targets).toMatchObject({ water_ml: 3600, fibre_g: 35 })
    expect(await getActivePlan(at())).toMatchObject({
      created_by: 'user',
      reason: 'Settings: water/fibre target',
      targets: { defaults: { kcal: 1400, water_ml: 3600, fibre_g: 35 } },
    })
  })
})
