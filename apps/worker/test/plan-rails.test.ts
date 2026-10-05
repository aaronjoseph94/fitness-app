// Owns: rail tests at the plan seam — a plan change carried into an active week plan never lifts a day above the
// 1,700 kcal ceiling; the 150 kcal step holds over a rolling 7 days for ai/mcp (two moves the same day are not 300);
// a split kcal move is one series (rejecting a step or reverting the review rejects its pending steps, and accepting a
// step early never schedules another). Rails from SPEC §2/§6/§9; today is Monday 2026-10-05 09:00 MDT.
import { ReminderKind, Weekday, type ReminderPrefs, type WeekPlanContentInput } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ai_events, createDb, plan_versions, profile, settings } from '../src/db'
import type { Deps } from '../src/lib/deps'
import type { ApplyReviewResult, RevertReviewResult } from '../src/modules/coach'
import { getDay } from '../src/modules/day'
import { getProposalRow } from '../src/modules/events'
import { acceptProposal, createVersion, getActivePlan, propose, rejectProposal } from '../src/modules/plan'
import { callTool } from '../src/modules/tools'
import { applyWeekPlan, proposeWeekPlan } from '../src/modules/week-plans'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
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
const kcal = (from: number, to: number) => ({ field: 'kcal' as const, weekday: null, from, to, reason: 'Coach' })
const status = async (id: string) => (await getProposalRow(at(), id))?.proposal_status
const proposalCount = async () => (await db.select().from(ai_events).where(eq(ai_events.kind, 'proposal'))).length
/** Aaron sets daily kcal himself: his own edit is where the next ai/mcp week of steps is measured from. */
const aaronSets = (to: number, now = NOW) => createVersion(at('user', now), { changes: [kcal(0, to)], reason: 'Aaron' })

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

describe('a plan change carried into the active week plan', () => {
  it('stops at the 1,700 kcal ceiling: Saturday 1,700 + an accepted +150 stays 1,700 (not 1,850)', async () => {
    const day = (k: number) => ({ kcal: k, protein_g: 130, carbs_g: 119, fat_g: 45, fibre_g: 30 })
    const week: WeekPlanContentInput = {
      targets: Object.fromEntries(Weekday.options.map((w) => [w, day(w === 'sat' ? 1700 : 1400)])) as WeekPlanContentInput['targets'],
      sessions: { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null },
      water_ml: 3000,
      steps: 8000,
      fast_dates: [],
      scan_date: null,
      focus_note: 'A bigger Saturday.',
    }
    const { week_plan } = await proposeWeekPlan(at('user'), { week_start: '2026-10-05', plan: week })
    await applyWeekPlan(at('user'), week_plan!.id)

    const asked = await propose(at('mcp'), { changes: [kcal(1400, 1550)], reason: 'More energy for training' })
    const decision = await acceptProposal(at('user'), asked.proposal!.id)

    expect((await getDay(at(), '2026-10-09')).targets?.kcal).toBe(1550)
    expect((await getDay(at(), '2026-10-10')).targets?.kcal).toBe(1700)
    const [change] = await db
      .select()
      .from(ai_events)
      .where(and(eq(ai_events.kind, 'change'), eq(ai_events.plan_version_id, decision.plan_version!.id)))
    expect(change!.body).toMatchObject({ week_plans_clamped: ['2026-10-10 kcal 1850 → 1700'] })
  })
})

describe('the 150 kcal step over a rolling 7 days (ai/mcp)', () => {
  it('a second +150 by mcp the same day applies nothing now and is scheduled a week out', async () => {
    // Daily kcal is 1,550 after the accepted mcp step above.
    const result = await createVersion(at('mcp'), { changes: [kcal(1550, 1700)], reason: 'Again' })

    expect(result.plan_version).toBeNull()
    expect(result.scheduled).toEqual([expect.objectContaining({ due: '2026-10-12', change: expect.objectContaining({ from: 1550, to: 1700 }) })])
    expect((await getActivePlan(at())).targets.defaults.kcal).toBe(1550)
    expect(await status(result.scheduled[0]!.proposal_id)).toBe('pending')
  })

  it('the other way: after Aaron sets 1,700, two −150 mcp moves the same day stop at 1,550', async () => {
    await aaronSets(1700)
    await createVersion(at('mcp'), { changes: [kcal(1700, 1550)], reason: 'Down' })
    const second = await createVersion(at('mcp'), { changes: [kcal(1550, 1400)], reason: 'Down again' })

    expect(second.plan_version).toBeNull()
    expect(second.scheduled.map((s) => [s.change.from, s.change.to, s.due])).toEqual([[1550, 1400, '2026-10-12']])
    expect((await getActivePlan(at())).targets.defaults.kcal).toBe(1550)
  })
})

describe('a split kcal move is one series', () => {
  it('rejecting step 1 rejects its pending later steps', async () => {
    await aaronSets(1400)
    const asked = await propose(at('ai'), { changes: [kcal(1400, 1700)], reason: 'Weekly review' })
    const step2 = asked.scheduled[0]!.proposal_id

    await rejectProposal(at('user'), asked.proposal!.id)

    expect(await status(step2)).toBe('rejected')
  })

  it('a step accepted before its week has passed is 409 not_due and schedules nothing new; it applies once the week has passed', async () => {
    const asked = await propose(at('ai'), { changes: [kcal(1400, 1700)], reason: 'Weekly review' })
    const step2 = asked.scheduled[0]!
    expect(step2.due).toBe('2026-10-12')
    // Step 1 accepted two days late (Wednesday): the week of steps now runs from Wednesday.
    await acceptProposal(at('user', '2026-10-07T15:00:00.000Z'), asked.proposal!.id)
    const before = await proposalCount()

    await expect(acceptProposal(at('user', '2026-10-12T15:00:00.000Z'), step2.proposal_id)).rejects.toMatchObject({
      status: 409,
      code: 'not_due',
      message: expect.stringContaining('2026-10-14'),
    })
    expect(await proposalCount()).toBe(before)
    expect(await status(step2.proposal_id)).toBe('pending')

    await acceptProposal(at('user', '2026-10-14T15:00:00.000Z'), step2.proposal_id)
    expect((await getActivePlan(at())).targets.defaults.kcal).toBe(1700)
  })

  it("revert_review rejects the pending later steps of the review's kcal move", async () => {
    await aaronSets(1400, '2026-10-14T16:00:00.000Z')
    const sunday = at('mcp', '2026-10-18T21:00:00.000Z')
    const applied = (await callTool(sunday, 'apply_review', {
      summary: 'More energy',
      narrative: 'Training went well; kcal up in two steps.',
      changes: [{ kind: 'target', field: 'kcal', to: 1700, reason: 'Recovery' }],
    })) as ApplyReviewResult
    expect(applied.scheduled).toHaveLength(1)

    const reverted = (await callTool(sunday, 'revert_review', { review_id: applied.review_id })) as RevertReviewResult

    expect(reverted.plan_version).not.toBeNull()
    expect(await status(applied.scheduled[0]!.proposal_id)).toBe('rejected')
    expect((await getActivePlan(at())).targets.defaults.kcal).toBe(1400)
  })
})
