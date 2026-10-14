// Owns: tests at the settings seam for training days as a proposal (plan 2026-10-14-ai-runs-train-three-day-week, Task
// 3). Ask AI's change of days is a pending `training_days` proposal (days in week order, the old days as `before`) and
// the settings stay as they are until Aaron taps it; accepting saves them and rebuilds the daily targets from today, so a
// Wednesday off the new days is no longer a training day. The days he already has are `unchanged` (no proposal); Claude
// (mcp) changes them at once. Rails from SPEC §2; Mon 2026-10-12 noon in Edmonton.
import { DEFAULT_REMINDER_PREFS } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ai_events, createDb, daily_targets, plan_versions, profile, settings } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { acceptProposal, materialiseTargets } from '../src/modules/plan'
import { getSettings, proposeTrainingDays } from '../src/modules/settings'

const db = createDb(env.DB)
const deps = (actor: Deps['actor']): Deps => ({ db, env, now: () => new Date('2026-10-12T18:00:00.000Z'), actor, waitUntil: () => undefined })
const MON_THU = ['mon', 'tue', 'wed', 'thu'] as const
/** The Wednesday after Mon 2026-10-12. */
const WEDNESDAY = '2026-10-14'

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
      training_days: [...MON_THU],
      reminders: DEFAULT_REMINDER_PREFS,
    }),
    db.insert(plan_versions).values({
      version: 1,
      active: true,
      created_by: 'user',
      reason: 'Baseline',
      diff: [],
      targets: { defaults: { kcal: 1400, protein_g: 130, carbs_g: 119, fat_g: 45, fibre_g: 30, water_ml: 3000, steps: 8000 }, overrides: {} },
    }),
  ])
})

// Each test starts on Mon–Thu with no events.
beforeEach(async () => {
  await db.batch([db.delete(ai_events), db.update(settings).set({ training_days: [...MON_THU] })])
})

const proposals = () => db.select().from(ai_events).where(eq(ai_events.kind, 'proposal'))

describe('proposeTrainingDays', () => {
  it("as ai: ['thu','mon','tue'] is a pending proposal in week order, and the settings stay Mon–Thu", async () => {
    const out = await proposeTrainingDays(deps('ai'), { training_days: ['thu', 'mon', 'tue'] })

    expect(out).toMatchObject({ status: 'proposed', training_days: ['mon', 'tue', 'thu'] })
    const [row] = await proposals()
    expect(row).toMatchObject({ id: out.proposal_id, actor: 'ai', proposal_status: 'pending' })
    expect(row!.body).toEqual({ kind: 'training_days', training_days: ['mon', 'tue', 'thu'], before: ['mon', 'tue', 'wed', 'thu'] })
    expect((await getSettings(deps('user'))).settings.training_days).toEqual(['mon', 'tue', 'wed', 'thu'])
  })

  it('accepting it saves Mon, Tue, Thu and the next Wednesday is no longer a training day', async () => {
    await materialiseTargets(deps('user'), { from: '2026-10-12' })
    const wednesday = () => db.select({ training_planned: daily_targets.training_planned }).from(daily_targets).where(eq(daily_targets.date, WEDNESDAY))
    expect(await wednesday()).toEqual([{ training_planned: true }])
    const { proposal_id } = await proposeTrainingDays(deps('ai'), { training_days: ['thu', 'mon', 'tue'] })

    const decision = await acceptProposal(deps('user'), proposal_id!)

    expect(decision.proposal.proposal_status).toBe('accepted')
    expect((await getSettings(deps('user'))).settings.training_days).toEqual(['mon', 'tue', 'thu'])
    expect(await wednesday()).toEqual([{ training_planned: false }])
  })

  it('the days he already has are unchanged (no proposal); Claude (mcp) changes them at once', async () => {
    expect(await proposeTrainingDays(deps('ai'), { training_days: ['thu', 'wed', 'tue', 'mon'] })).toEqual({
      status: 'unchanged',
      proposal_id: null,
      training_days: ['mon', 'tue', 'wed', 'thu'],
    })
    expect(await proposals()).toEqual([])

    expect(await proposeTrainingDays(deps('mcp'), { training_days: ['tue', 'mon', 'thu'] })).toEqual({
      status: 'applied',
      proposal_id: null,
      training_days: ['mon', 'tue', 'thu'],
    })
    expect((await getSettings(deps('user'))).settings.training_days).toEqual(['mon', 'tue', 'thu'])
    expect(await proposals()).toEqual([])
  })
})
