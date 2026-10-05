// Owns: Prove-It tests for the rails (SPEC §9; CLAUDE.md) across the week-plan write paths — an ai/mcp week plan for
// this week is measured from what last week's days actually had (not from a plan version changed today), an ai/mcp
// plan change carried into this week's active week plan never lifts a day more than 150 kcal above the same weekday
// last week, and a fast day's stored targets are guarded too (they go live when the fast is cancelled or moved). Rails from SPEC §2/§6 (floor 1,400, ceiling 1,700, protein 130 g, fat 45 g);
// today is Monday 2026-10-05 09:00 MDT, so this week is 2026-10-05 … 2026-10-11.
import { addDays } from '@fitness/shared/engine'
import { ReminderKind, Weekday, type ReminderPrefs, type WeekPlanContentInput } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ai_events, createDb, daily_targets, fast_logs, plan_versions, profile, settings, week_plans } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { getDay } from '../src/modules/day'
import { cancelFast, planFast } from '../src/modules/fasting'
import { createVersion } from '../src/modules/plan'
import { applyWeekPlan, proposeWeekPlan } from '../src/modules/week-plans'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
const NOW = '2026-10-05T15:00:00.000Z'
const THIS_MONDAY = '2026-10-05'
const V1 = crypto.randomUUID()
const at = (actor: Deps['actor'] = 'mcp'): Deps => ({
  db,
  env,
  now: () => new Date(NOW),
  actor,
  waitUntil: (p) => void pending.push(p.catch(() => undefined)),
})
afterEach(async () => {
  await Promise.all(pending.splice(0))
})

const reminders = Object.fromEntries(ReminderKind.options.map((k) => [k, { enabled: true, time: null }])) as ReminderPrefs
const kcal = (from: number, to: number) => ({ field: 'kcal' as const, weekday: null, from, to, reason: 'Coach' })
const week = (k: number): WeekPlanContentInput => ({
  targets: Object.fromEntries(Weekday.options.map((w) => [w, { kcal: k, protein_g: 130, carbs_g: 119, fat_g: 45, fibre_g: 30 }])) as WeekPlanContentInput['targets'],
  sessions: { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null },
  water_ml: 3000,
  steps: 8000,
  fast_dates: [],
  scan_date: null,
  focus_note: 'More fuel for training.',
})
const todayKcal = async () => (await getDay(at(), THIS_MONDAY)).targets?.kcal

beforeEach(async () => {
  // A fresh instance per test: version 1 at 1,400 kcal, made two weeks ago, and last week's days materialised from it.
  await db.batch([
    db.delete(daily_targets),
    db.delete(ai_events),
    db.delete(fast_logs),
    db.delete(week_plans),
    db.delete(plan_versions),
    db.delete(settings),
    db.delete(profile),
  ])
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
      id: V1,
      version: 1,
      active: true,
      created_by: 'user',
      reason: 'Baseline rails from doctor and dietitian',
      diff: [],
      targets: { defaults: { kcal: 1400, protein_g: 130, carbs_g: 119, fat_g: 45, fibre_g: 30, water_ml: 3000, steps: 8000 }, overrides: {} },
      created_at: '2026-09-21T15:00:00.000Z',
      updated_at: '2026-09-21T15:00:00.000Z',
    }),
  ])
  const lastWeek = Array.from({ length: 7 }, (_, i) => ({
    date: addDays('2026-09-28', i),
    plan_version_id: V1,
    kcal: 1400,
    protein_g: 130,
    carbs_g: 119,
    fat_g: 45,
    fibre_g: 30,
    water_ml: 3000,
    steps: 8000,
    is_fast_day: false,
    training_planned: i < 4,
  }))
  await db.batch([db.insert(daily_targets).values(lastWeek.slice(0, 4)), db.insert(daily_targets).values(lastWeek.slice(4))])
})

describe('an mcp week plan for this week after an mcp plan change today', () => {
  it('is held to 150 kcal above last week (1,400 → at most 1,550, not 1,700)', async () => {
    await createVersion(at('mcp'), { changes: [kcal(1400, 1550)], reason: 'More fuel' })
    expect(await todayKcal()).toBe(1550)

    const proposed = await proposeWeekPlan(at('mcp'), { week_start: THIS_MONDAY, plan: week(1700) })

    expect(proposed.week_plan?.plan.targets.mon.kcal).toBe(1550)
    expect(proposed.adjusted).toEqual(expect.arrayContaining([expect.objectContaining({ where: 'mon.kcal', rule: 'kcal_step' })]))
    await applyWeekPlan(at('mcp'), proposed.week_plan!.id)
    expect(await todayKcal()).toBe(1550)
  })
})

describe("an mcp plan change carried into this week's mcp week plan", () => {
  it('stops 150 kcal above last week: 1,550 + an mcp +150 stays 1,550 today, and the cut is reported', async () => {
    const proposed = await proposeWeekPlan(at('mcp'), { week_start: THIS_MONDAY, plan: week(1550) })
    await applyWeekPlan(at('mcp'), proposed.week_plan!.id)
    expect(await todayKcal()).toBe(1550)

    const result = await createVersion(at('mcp'), { changes: [kcal(1400, 1550)], reason: 'More fuel' })

    expect(await todayKcal()).toBe(1550)
    const [change] = await db
      .select()
      .from(ai_events)
      .where(and(eq(ai_events.kind, 'change'), eq(ai_events.plan_version_id, result.plan_version!.id)))
    expect(change!.body).toMatchObject({ week_plans_clamped: expect.arrayContaining(['2026-10-05 kcal 1700 → 1550']) })
  })
})

describe("an mcp week plan's targets on a fast day", () => {
  it('are guarded too: 2,500 kcal on the fast Thursday is stored as last week’s, so cancelling the fast never lifts it past the rails', async () => {
    // Wednesday 2026-10-14 19:00 MDT → Thursday 19:00: Thursday 2026-10-15 is the fast day.
    const fast = await planFast(at('user'), { id: crypto.randomUUID(), started_at: '2026-10-15T01:00:00.000Z' })
    const plan = week(1400)
    plan.targets.thu = { kcal: 2500, protein_g: 130, carbs_g: 119, fat_g: 45, fibre_g: 30 }
    plan.fast_dates = ['2026-10-15']

    const proposed = await proposeWeekPlan(at('mcp'), { week_start: '2026-10-12', plan })

    expect(proposed.week_plan?.plan.targets.thu.kcal).toBe(1400)
    expect(proposed.adjusted).toEqual(expect.arrayContaining([expect.objectContaining({ where: 'thu.kcal', rule: 'fast_day_targets' })]))
    await applyWeekPlan(at('mcp'), proposed.week_plan!.id)
    await cancelFast(at('user'), fast.id)
    expect((await getDay(at(), '2026-10-15')).targets?.kcal).toBe(1400)
  })
})
