// Owns: tests at the settings seam for a goal change as a proposal — Ask AI's "aim for 88" is a pending goal_change
// proposal with the old goals as `before`, the profile stays until Aaron taps it, and accepting saves the goal; a
// goal of 200 kg, or one at or above the start weight, is refused (422). The accepted change is recorded as a
// profile change event carrying the goal it replaced. Start 95.1 kg; Mon 2026-10-12 noon in Edmonton.
import { DEFAULT_REMINDER_PREFS } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { ai_events, createDb, plan_versions, profile, settings } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { acceptProposal } from '../src/modules/plan'
import { getSettings, proposeGoalChange } from '../src/modules/settings'

const db = createDb(env.DB)
const deps = (actor: Deps['actor']): Deps => ({
  db,
  env,
  now: () => new Date('2026-10-12T18:00:00.000Z'),
  actor,
  waitUntil: () => undefined,
})

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
      training_days: ['mon', 'tue', 'thu'],
      reminders: DEFAULT_REMINDER_PREFS,
    }),
    db.insert(plan_versions).values({
      version: 1,
      active: true,
      created_by: 'user',
      reason: 'Baseline',
      diff: [],
      targets: {
        defaults: {
          kcal: 1400,
          protein_g: 130,
          carbs_g: 119,
          fat_g: 45,
          fibre_g: 30,
          water_ml: 3000,
          steps: 8000,
        },
        overrides: {},
      },
    }),
  ])
})

describe('proposeGoalChange', () => {
  it('as ai: 88 kg is a pending proposal; accepting it makes 88 the goal', async () => {
    const out = await proposeGoalChange(deps('ai'), {
      goal_weight_kg: 88,
      goal_date: null,
      reason: 'Doctor says 88',
    })

    expect(out).toMatchObject({
      status: 'proposed',
      goal_weight_kg: 88,
      goal_date: null,
      before: { goal_weight_kg: 65, goal_date: '2027-08-04' },
    })
    const [row] = await db.select().from(ai_events).where(eq(ai_events.id, out.proposal_id))
    expect(row).toMatchObject({ kind: 'proposal', actor: 'ai', proposal_status: 'pending' })
    expect((await getSettings(deps('user'))).profile.goal_weight_kg).toBe(65)

    const decision = await acceptProposal(deps('user'), out.proposal_id)

    expect(decision.proposal.proposal_status).toBe('accepted')
    expect((await getSettings(deps('user'))).profile).toMatchObject({
      goal_weight_kg: 88,
      goal_date: '2027-08-04',
    })
    // The record is a profile change event with the goal it replaced (changed back in Settings, no plan version).
    const changes = await db.select().from(ai_events).where(eq(ai_events.kind, 'change'))
    expect(changes.map((e) => e.body)).toContainEqual({
      entity: 'profile',
      changes: [{ path: 'goal_weight_kg', from: 65, to: 88 }],
    })
  })

  it('a goal of 200 kg, or at the start weight, is refused with 422', async () => {
    await expect(
      proposeGoalChange(deps('ai'), { goal_weight_kg: 200, goal_date: null }),
    ).rejects.toMatchObject({
      status: 422,
    })
    await expect(
      proposeGoalChange(deps('ai'), { goal_weight_kg: 95.1, goal_date: null }),
    ).rejects.toMatchObject({
      status: 422,
    })
  })
})
