// Owns: Prove-It tests for restoring a plan version through the coach (MCP restore_plan_version, SPEC §9/§10) — a
// restore is a change like any other for ai/mcp: when it would move daily kcal more than 150 from where it was a week ago
// (the rolling 7-day window), leave the floor or ceiling, or put protein or fat under their minimums, it is refused (403
// needs_approval: Aaron reverts in the app), while Aaron's own restore in the app stays a one-tap revert. Rails from
// SPEC §2/§6 (floor 1,400, ceiling 1,700); today is Monday 2026-10-05 09:00 MDT.
import { ReminderKind, type ReminderPrefs } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ai_events, createDb, daily_targets, plan_versions, profile, settings } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { getActivePlan, restoreVersion } from '../src/modules/plan'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
const NOW = '2026-10-05T15:00:00.000Z'
const at = (actor: Deps['actor']): Deps => ({ db, env, now: () => new Date(NOW), actor, waitUntil: (p) => void pending.push(p.catch(() => undefined)) })
afterEach(async () => {
  await Promise.all(pending.splice(0))
})
const reminders = Object.fromEntries(ReminderKind.options.map((k) => [k, { enabled: true, time: null }])) as ReminderPrefs
const targets = (kcal: number) => ({ defaults: { kcal, protein_g: 130, carbs_g: 119, fat_g: 45, fibre_g: 30, water_ml: 3000, steps: 8000 }, overrides: {} })
const V1 = crypto.randomUUID()
const V2 = crypto.randomUUID()

beforeEach(async () => {
  await db.batch([db.delete(daily_targets), db.delete(ai_events), db.delete(plan_versions), db.delete(settings), db.delete(profile)])
  // v1 Aaron 1,400 three weeks ago → v2 coach 1,550 two weeks ago → v3 coach 1,700 eight days ago (active a week ago).
  const version = (id: string, n: number, kcal: number, by: 'user' | 'mcp', created_at: string, active = false) =>
    db.insert(plan_versions).values({ id, version: n, active, created_by: by, reason: `v${n}`, diff: [], targets: targets(kcal), created_at, updated_at: created_at })
  await db.batch([
    db.insert(profile).values({ height_cm: 165.1, sex: 'male', goal_weight_kg: 65, goal_date: '2027-08-04', start_weight_kg: 95.1, start_date: '2026-09-14' }),
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
    version(V1, 1, 1400, 'user', '2026-09-14T15:00:00.000Z'),
    version(V2, 2, 1550, 'mcp', '2026-09-21T15:00:00.000Z'),
    version(crypto.randomUUID(), 3, 1700, 'mcp', '2026-09-27T15:00:00.000Z', true),
  ])
})

describe('restore_plan_version by the coach', () => {
  it('may not drop daily kcal 1,700 → 1,400 in one go (300 within the rolling week); the plan stays at 1,700', async () => {
    await expect(restoreVersion(at('mcp'), V1)).rejects.toMatchObject({ status: 403, code: 'needs_approval', message: expect.stringMatching(/in the app/) })

    expect((await getActivePlan(at('user'))).targets.defaults.kcal).toBe(1700)
  })

  it('may not put protein under a minimum Aaron raised since (130 g < 140 g), though its kcal move fits the step', async () => {
    await db.update(settings).set({ protein_min_g: 140 })

    await expect(restoreVersion(at('mcp'), V2)).rejects.toMatchObject({ status: 403, code: 'needs_approval' })

    expect((await getActivePlan(at('user'))).version).toBe(3)
  })

  it('restores a version within the rails and the step (1,700 → 1,550)', async () => {
    const restored = await restoreVersion(at('mcp'), V2)

    expect(restored.targets.defaults.kcal).toBe(1550)
  })

  it('Aaron restoring the same version in the app is a one-tap revert', async () => {
    const restored = await restoreVersion(at('user'), V1)

    expect(restored.targets.defaults.kcal).toBe(1400)
  })
})
