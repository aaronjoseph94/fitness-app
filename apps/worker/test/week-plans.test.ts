// Owns: tests at the week-plans seam (and its tools) — the guards on propose (calorie floor, the allowed exercise
// set), apply rebuilding the week's daily targets with the plan's literal kcal (a fast date at 0 kcal, +500 ml water),
// revert walking back to the previous plan and then to the plan version, and a Gemini draft never replacing Claude's
// plan, a plan change (accepted water, a kcal step) carried into the active week plan's days, and a template swap
// reaching the planned session copied from the template; a plan's fast dates mirror the fast log (a date with no planned
// fast is rejected; moving the fast moves the 0 kcal day and the active plan's fast_dates). Rails from SPEC §2/§6
// (floor 1,400, ceiling 1,700, protein 130 g, fat 45 g); today is Monday 2026-10-05.
import { ReminderKind, Weekday, type ReminderPrefs, type WeekPlanContentInput, type WeekPlanProposal } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { asc, between } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createDb, daily_targets, exercises, fast_logs, plan_versions, profile, settings, type NewRow } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { callTool, findTool, toolJsonSchemas } from '../src/modules/tools'
import { getProposalRow } from '../src/modules/events'
import { moveFast } from '../src/modules/fasting'
import { acceptProposal, createVersion, propose } from '../src/modules/plan'
import { createTemplate, swapTemplateExercise } from '../src/modules/training'
import { applyWeekPlan, getWeekPlan, proposeWeekPlan, rejectWeekPlan, revertWeekPlan } from '../src/modules/week-plans'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
const NOW = '2026-10-05T15:00:00.000Z'
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

type Ex = NewRow<typeof exercises> & { id: string }
const ex = (slug: string, equipment: string, primary: Ex['primary_muscles']): Ex => ({
  id: crypto.randomUUID(),
  slug,
  name: slug,
  category: 'strength',
  equipment,
  mechanic: 'compound',
  level: 'beginner',
  primary_muscles: primary,
  secondary_muscles: [],
  instructions: [],
  image_paths: [],
  source: 'free-exercise-db',
})
const bench = ex('barbell-bench-press', 'barbell', ['chest'])
const pulldown = ex('wide-grip-lat-pulldown', 'cable', ['lats'])
const row = ex('seated-cable-rows', 'cable', ['middle back'])
const press = ex('dumbbell-shoulder-press', 'dumbbell', ['shoulders'])
const pushups = ex('pushups', 'body only', ['chest'])
const dbBench = ex('dumbbell-bench-press', 'dumbbell', ['chest'])

const NEXT_MONDAY = '2026-10-12'
/** The planned fast: Wednesday 2026-10-14 19:00 MDT → Thursday 19:00, so Thursday 2026-10-15 is the fast day. */
const FAST_ID = crypto.randomUUID()
const day = (kcal: number) => ({ kcal, protein_g: 130, carbs_g: 150, fat_g: 45, fibre_g: 30 })
const set = (e: Ex, sets = 4) => ({ exercise_id: e.id, sets, rep_min: 8, rep_max: 12, target_load_kg: null, rest_sec: 90, note: null })
const upper = { template_id: null, name: 'Upper A', exercises: [set(bench), set(pulldown), set(row), set(press)] }

/** Next week: Mon 1,550 · Tue 1,500 · Wed 1,450 · Thu fast · Fri–Sun 1,400; Upper A on Monday. */
function plan(over: Partial<Record<Weekday, number>> = {}, sessions: Partial<WeekPlanContentInput['sessions']> = {}): WeekPlanContentInput {
  const kcal = { mon: 1550, tue: 1500, wed: 1450, thu: 1400, fri: 1400, sat: 1400, sun: 1400, ...over }
  return {
    targets: Object.fromEntries(Weekday.options.map((w) => [w, day(kcal[w])])) as WeekPlanContentInput['targets'],
    sessions: { mon: upper, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null, ...sessions },
    water_ml: 3000,
    steps: 9000,
    fast_dates: ['2026-10-15'],
    scan_date: null,
    focus_note: 'Protein first; Thursday is a fast day, keep it light.',
  }
}

const weekTargets = () =>
  db.select().from(daily_targets).where(between(daily_targets.date, NEXT_MONDAY, '2026-10-18')).orderBy(asc(daily_targets.date))

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
      targets: { defaults: { kcal: 1400, protein_g: 130, carbs_g: 118.75, fat_g: 45, fibre_g: 30, water_ml: 3000, steps: 8000 }, overrides: {} },
    }),
    ...[bench, pulldown, row, press, pushups, dbBench].map((e) => db.insert(exercises).values(e)),
    db.insert(fast_logs).values({ id: FAST_ID, started_at: '2026-10-15T01:00:00.000Z', start_date: '2026-10-14', planned: true }),
  ])
})

describe('propose_week_plan', () => {
  it('rejects a day at 1,350 kcal and a body-only exercise, and stores nothing', async () => {
    const pushupDay = { template_id: null, name: 'Push', exercises: [set(pushups, 4), set(bench, 4), set(press, 4)] }
    const result = await proposeWeekPlan(at(), { week_start: NEXT_MONDAY, plan: plan({ wed: 1350 }, { tue: pushupDay }) })

    expect(result.week_plan).toBeNull()
    expect(result.rejected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ where: 'wed.kcal', rule: 'calorie_floor' }),
        expect.objectContaining({ where: 'tue.session', rule: 'excluded_category' }),
      ]),
    )
    expect((await getWeekPlan(at(), NEXT_MONDAY)).proposed).toBeNull()
  })
})

describe('apply and revert', () => {
  it('apply rebuilds the seven days of daily_targets with the plan’s kcal (the fast date at 0 kcal, +500 ml water)', async () => {
    const { week_plan } = await proposeWeekPlan(at(), { week_start: NEXT_MONDAY, plan: plan() })
    expect(week_plan).toMatchObject({ status: 'proposed', author: 'claude_mcp' })
    expect(week_plan!.plan.sessions.mon?.muscle_scores).toEqual({ chest: 4, lats: 4, 'middle back': 4, shoulders: 4 })

    const applied = await applyWeekPlan(at(), week_plan!.id)
    expect(applied.active).toMatchObject({ id: week_plan!.id, status: 'active' })

    const rows = await weekTargets()
    expect(rows.map((r) => r.kcal)).toEqual([1550, 1500, 1450, 0, 1400, 1400, 1400])
    expect(rows.map((r) => r.week_plan_id)).toEqual(Array(7).fill(week_plan!.id))
    expect(rows[3]).toMatchObject({ date: '2026-10-15', is_fast_day: true, water_ml: 3500 })
    expect(rows.map((r) => r.training_planned)).toEqual([true, false, false, false, false, false, false])
    expect(rows.every((r) => r.plan_version_id === applied.plan_version_id)).toBe(true)
  })

  it('revert restores the previous plan, and reverting that hands the week back to the plan version', async () => {
    const first = (await getWeekPlan(at(), NEXT_MONDAY)).active!
    const second = await callTool(at(), 'propose_week_plan', { week_start: NEXT_MONDAY, plan: plan({ mon: 1450 }) })
    const secondId = (second as { week_plan: { id: string } }).week_plan.id
    await callTool(at(), 'apply_week_plan', { id: secondId })
    expect((await weekTargets())[0]!.kcal).toBe(1450)

    const reverted = await revertWeekPlan(at(), secondId)
    expect(reverted.active?.id).toBe(first.id)
    expect(reverted.superseded).toMatchObject({ id: secondId, status: 'superseded' })
    expect((await weekTargets())[0]).toMatchObject({ kcal: 1550, week_plan_id: first.id })

    await revertWeekPlan(at(), first.id)
    const rows = await weekTargets()
    // Thursday stays the fast day: the fast is in the fast log, whichever plan the week follows.
    expect(rows.map((r) => r.kcal)).toEqual([1400, 1400, 1400, 0, 1400, 1400, 1400])
    expect(rows.every((r) => r.week_plan_id === null)).toBe(true)
  })

  it('a Gemini draft does not replace a plan by Claude', async () => {
    const claude = await proposeWeekPlan(at(), { week_start: NEXT_MONDAY, plan: plan() })
    const draft = await proposeWeekPlan(at('ai'), { week_start: NEXT_MONDAY, plan: plan(), author: 'gemini' })
    expect(draft.week_plan).toBeNull()
    expect(draft.note).toContain('by Claude')

    const view = (await callTool(at(), 'get_week_plan', { week_start: '2026-10-14' })) as Awaited<ReturnType<typeof getWeekPlan>>
    expect(view.proposed?.id).toBe(claude.week_plan!.id)
    await expect(applyWeekPlan(at('ai'), claude.week_plan!.id)).rejects.toMatchObject({ status: 403 })
  })
})

describe('Ask AI week plans', () => {
  it('wait as a proposal beside the active plan; accepting applies it, rejecting supersedes it', async () => {
    const active = await proposeWeekPlan(at(), { week_start: NEXT_MONDAY, plan: plan() })
    await applyWeekPlan(at(), active.week_plan!.id)

    const asked = (await callTool(at('ai'), 'propose_week_plan', { week_start: NEXT_MONDAY, plan: plan({ mon: 1500 }) })) as WeekPlanProposal
    const id = asked.week_plan!.id
    expect(asked.week_plan).toMatchObject({ status: 'proposed', author: 'gemini' })
    expect((await getWeekPlan(at(), NEXT_MONDAY)).active?.id).toBe(active.week_plan!.id)

    // The proposal event shares the plan's id; accepting it goes through the week-plans module's handler.
    const decision = await acceptProposal(at('user'), id)
    expect(decision).toMatchObject({ proposal: { proposal_status: 'accepted' }, applied: { entity: 'week_plan', id } })
    expect((await weekTargets())[0]).toMatchObject({ kcal: 1500, week_plan_id: id })

    const again = (await callTool(at('ai'), 'propose_week_plan', { week_start: NEXT_MONDAY, plan: plan({ mon: 1450 }) })) as WeekPlanProposal
    expect(await rejectWeekPlan(at('user'), again.week_plan!.id)).toMatchObject({ status: 'superseded' })
    expect((await getProposalRow(at(), again.week_plan!.id))?.proposal_status).toBe('rejected')
  })
})

describe('plan changes while a week plan is active', () => {
  it("an accepted water change and a +100 kcal step reach the week plan's days, keeping its per-day shape", async () => {
    const { week_plan } = await proposeWeekPlan(at(), { week_start: NEXT_MONDAY, plan: plan() })
    await applyWeekPlan(at(), week_plan!.id)

    const asked = await propose(at('ai'), {
      changes: [{ field: 'water_ml', weekday: null, from: 3000, to: 3500, reason: 'You asked for 3.5 L' }],
      reason: 'Raise water to 3.5 L',
    })
    await acceptProposal(at('user'), asked.proposal!.id)
    await createVersion(at(), { changes: [{ field: 'kcal', weekday: null, from: 1400, to: 1500, reason: 'Slower loss' }], reason: 'Review' })

    const rows = await weekTargets()
    expect(rows.map((r) => r.water_ml)).toEqual([3500, 3500, 3500, 4000, 3500, 3500, 3500])
    expect(rows.map((r) => r.kcal)).toEqual([1650, 1600, 1550, 0, 1500, 1500, 1500])
    expect(rows.every((r) => r.week_plan_id === week_plan!.id)).toBe(true)
    expect((await getWeekPlan(at(), NEXT_MONDAY)).active?.plan.water_ml).toBe(3500)
  })
})

describe('template swaps', () => {
  it("a swap in a template reaches the active week plan's session copied from it", async () => {
    const template = await createTemplate(at('user'), { id: crypto.randomUUID(), name: 'Upper A', origin: 'custom', exercises: upper.exercises })
    const { week_plan } = await proposeWeekPlan(at(), { week_start: NEXT_MONDAY, plan: plan({}, { mon: { ...upper, template_id: template.id } }) })
    await applyWeekPlan(at(), week_plan!.id)

    const swap = await swapTemplateExercise(at(), { template_id: template.id, from_exercise_id: bench.id, to_exercise_id: dbBench.id })
    expect(swap.status).toBe('applied')
    const active = (await getWeekPlan(at(), NEXT_MONDAY)).active!
    expect(active.id).toBe(week_plan!.id)
    expect(active.plan.sessions.mon!.exercises.map((e) => e.exercise_id)).toEqual([dbBench.id, pulldown.id, row.id, press.id])
  })
})

describe('fasts in week plans', () => {
  it('a fast date with no planned fast is rejected; moving the fast moves the 0 kcal day and the plan follows', async () => {
    const unplanned = await proposeWeekPlan(at(), { week_start: NEXT_MONDAY, plan: { ...plan(), fast_dates: ['2026-10-15', '2026-10-17'] } })
    expect(unplanned.week_plan).toBeNull()
    expect(unplanned.rejected).toEqual([expect.objectContaining({ where: 'fast_dates', rule: 'fast_not_planned' })])

    const { week_plan } = await proposeWeekPlan(at(), { week_start: NEXT_MONDAY, plan: plan() })
    await applyWeekPlan(at(), week_plan!.id)
    // Thursday 19:00 → Friday 19:00: Friday is the fast day, Thursday is back to the plan's 1,400.
    await moveFast(at(), FAST_ID, { started_at: '2026-10-16T01:00:00.000Z' })

    const rows = await weekTargets()
    expect(rows.map((r) => r.is_fast_day)).toEqual([false, false, false, false, true, false, false])
    expect(rows[3]).toMatchObject({ date: '2026-10-15', kcal: 1400 })
    expect((await getWeekPlan(at(), NEXT_MONDAY)).active?.plan.fast_dates).toEqual(['2026-10-16'])
  })
})

describe('week-plan tools', () => {
  it('build their JSON Schemas (the model sees every weekday of targets and sessions)', () => {
    const propose = findTool('propose_week_plan')!
    const input = toolJsonSchemas(propose).input as { properties: { plan: { properties: { targets: { required: string[] } } } } }
    expect(input.properties.plan.properties.targets.required).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
    for (const name of ['get_week_plan', 'apply_week_plan', 'revert_week_plan', 'replace_week_plan']) expect(toolJsonSchemas(findTool(name)!).output).toBeTruthy()
  })
})
