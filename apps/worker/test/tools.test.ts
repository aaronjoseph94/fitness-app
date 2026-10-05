// Owns: tests at the tools-layer seam (modules/tools callTool + the coach module behind it) — get_today for the
// baseline date, the review bundle's size for a seeded week (2026-W40, Mon 2026-09-28 … Sun 2026-10-04), apply_review
// applying one change and dropping one below the calorie floor as a single plan version, revert_review, and every
// tool exposing JSON Schemas and both annotations.
import { ReminderKind, type ReminderPrefs } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  createDb,
  fast_logs,
  meal_items,
  meals,
  plan_versions,
  profile,
  settings,
  step_logs,
  water_logs,
  weight_logs,
} from '../src/db'
import type { Deps } from '../src/lib/deps'
import type { ApplyReviewResult, ReviewBundle, RevertReviewResult } from '../src/modules/coach'
import { acceptProposal, listVersions } from '../src/modules/plan'
import { noteScanDue, scanSchedule } from '../src/modules/scans'
import { getSettings } from '../src/modules/settings'
import { getReview } from '../src/modules/reviews'
import { allTools, callTool, getProcedure, toolJsonSchemas } from '../src/modules/tools'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []

/** Sunday 2026-10-04 20:00 in Edmonton (MDT, UTC−6): the review week is 2026-W40. */
const SUNDAY_EVENING = '2026-10-05T02:00:00.000Z'
const deps: Deps = {
  db,
  env,
  now: () => new Date(SUNDAY_EVENING),
  actor: 'mcp',
  waitUntil: (p) => void pending.push(p.catch(() => undefined)),
}

const baseline = {
  kcal: 1400,
  protein_g: 130,
  carbs_g: 118.75,
  fat_g: 45,
  fibre_g: 30,
  water_ml: 3000,
  steps: 8000,
}
const reminders = Object.fromEntries(
  ReminderKind.options.map((k) => [k, { enabled: true, time: null }]),
) as ReminderPrefs

function meal(date: string, slot: 'lunch' | 'dinner', kcal: number, protein_g: number) {
  const id = crypto.randomUUID()
  return [
    db.insert(meals).values({ id, date, slot, input_method: 'manual', status: 'confirmed' }),
    db
      .insert(meal_items)
      .values({
        meal_id: id,
        description: slot,
        grams: 300,
        kcal,
        protein_g,
        carbs_g: 50,
        fat_g: 10,
        fibre_g: 5,
      }),
  ] as const
}

beforeAll(async () => {
  await db.batch([
    db
      .insert(profile)
      .values({
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
      forecast: {
        finish_date: '2027-06-17',
        weekly_rate_kg: 1.046,
        band: { low: 0.837, high: 1.256 },
        tdee_est: 2551,
      },
    }),
    db.insert(weight_logs).values([
      { date: '2026-09-26', weight_kg: 95.1 },
      { date: '2026-10-04', weight_kg: 94.3 },
    ]),
    ...meal('2026-09-28', 'lunch', 600, 50),
    ...meal('2026-09-28', 'dinner', 800, 70),
    ...meal('2026-09-29', 'lunch', 700, 60),
    ...meal('2026-09-29', 'dinner', 700, 80),
    db.insert(water_logs).values([
      { date: '2026-09-28', logged_at: '2026-09-28T18:00:00.000Z', amount_ml: 2500 },
      { date: '2026-09-29', logged_at: '2026-09-29T18:00:00.000Z', amount_ml: 3000 },
    ]),
    db.insert(step_logs).values([
      { date: '2026-09-28', steps: 8000 },
      { date: '2026-09-29', steps: 6000 },
    ]),
    // Wednesday 00:00–23:30 MDT: 23.5 h ≥ 95 % of 24 h → completed.
    db.insert(fast_logs).values({
      started_at: '2026-09-30T06:00:00.000Z',
      ended_at: '2026-10-01T05:30:00.000Z',
      start_date: '2026-09-30',
      end_date: '2026-09-30',
      planned: true,
    }),
  ])
})

afterEach(async () => {
  await Promise.all(pending.splice(0))
})

describe('tools layer', () => {
  it('every tool has input/output JSON Schemas and declares both annotations; procedures are served', () => {
    const tools = allTools()
    for (const name of [
      'get_today',
      'query_metric',
      'get_review_bundle',
      'apply_review',
      'revert_review',
      'set_dashboard_note',
      'schedule_scan',
      'get_procedure',
    ])
      expect(tools.some((t) => t.name === name)).toBe(true)
    for (const t of tools) {
      const s = toolJsonSchemas(t)
      expect(s.input.type, t.name).toBe('object')
      expect(typeof t.annotations.readOnlyHint, t.name).toBe('boolean')
      expect(typeof t.annotations.destructiveHint, t.name).toBe('boolean')
    }
    expect(
      tools
        .find((t) => t.name === 'apply_review')!
        .description.startsWith('For a weekly review, call get_procedure("coach_review") first.'),
    ).toBe(true)
    expect(getProcedure('coach_review').text).toContain('propose_week_plan')
  })

  it('set_reminder_time waits as a proposal from Ask AI (auto-apply off) until accepted; from Claude it applies', async () => {
    type Out = { status: string; proposal: { id: string } | null; applied: ReminderPrefs | null }
    const asked = (await callTool({ ...deps, actor: 'ai' }, 'set_reminder_time', { kind: 'weigh_in', time: '07:15' })) as Out
    expect(asked).toMatchObject({ status: 'proposed', applied: null })
    expect((await getSettings(deps)).settings.reminders.weigh_in?.time).toBeNull()

    expect(await acceptProposal({ ...deps, actor: 'user' }, asked.proposal!.id)).toMatchObject({ applied: { entity: 'settings' } })
    expect((await getSettings(deps)).settings.reminders.weigh_in).toEqual({ enabled: true, time: '07:15' })

    const claude = (await callTool(deps, 'set_reminder_time', { kind: 'workout', time: '17:15' })) as Out
    expect(claude).toMatchObject({ status: 'applied', proposal: null, applied: { workout: { enabled: true, time: '17:15' } } })
  })

  it('schedule_scan moves the due date the reminder and the nightly note use', async () => {
    await callTool(deps, 'schedule_scan', { date: '2026-10-20' })
    expect(await scanSchedule(deps)).toMatchObject({ scheduled: '2026-10-20', due: '2026-10-20', source: 'scheduled' })
    expect(await noteScanDue(deps, '2026-10-20')).toEqual({ due: '2026-10-20', noted: true })
    expect(await noteScanDue(deps, '2026-10-20')).toEqual({ due: '2026-10-20', noted: false })
  })

  it('get_today returns the day view for the baseline date 2026-09-26', async () => {
    const day = (await callTool(deps, 'get_today', { date: '2026-09-26' })) as {
      date: string
      targets: { kcal: number }
      weight: { raw_kg: number; trend_kg: number }
    }
    expect(day.date).toBe('2026-09-26')
    expect(day.targets.kcal).toBe(1400)
    expect(day.weight.raw_kg).toBe(95.1)
    expect(day.weight.trend_kg).toBe(95.1)
  })

  it('get_review_bundle covers the review week in under 20 KB', async () => {
    const bundle = (await callTool(deps, 'get_review_bundle', {})) as ReviewBundle
    const size = JSON.stringify(bundle).length
    expect(size).toBeLessThan(20_000)
    expect(bundle.period).toMatchObject({
      from: '2026-09-28',
      to: '2026-10-04',
      weeks: ['2026-W40'],
      previous_weeks: ['2026-W39'],
    })
    expect(bundle.rails).toMatchObject({
      calorie_floor: 1400,
      calorie_ceiling: 1700,
      protein_min_g: 130,
      kcal_step_max: 150,
    })
    // 1,400 kcal on each of two logged days plus the fast day at 0 → mean over 3 logged days = 933.
    expect(bundle.weeks[0]).toMatchObject({ week: '2026-W40', days_logged: 3 })
    expect(bundle.totals.intake_avg.kcal).toBe(933)
    expect(bundle.fasts).toEqual([expect.objectContaining({ status: 'completed', hours: 23.5 })])
  })

  it('apply_review applies a valid change, drops one below the floor, as one plan version; revert_review undoes it', async () => {
    const before = (await listVersions(deps)).length
    const result = (await callTool(deps, 'apply_review', {
      summary: 'Protein up; kcal stays at the floor',
      narrative:
        'A steady week: two days logged at 1,400 kcal and a completed 24 h fast. Protein goes up to 140 g.',
      changes: [
        { kind: 'target', field: 'protein_g', to: 140, reason: 'Protein adherence was 50 %' },
        { kind: 'target', field: 'kcal', to: 1300, reason: 'Faster loss' },
        { kind: 'dashboard_note', text: 'Protein first at every meal.', until: '2026-10-11' },
      ],
    })) as ApplyReviewResult

    expect(result.week).toBe('2026-W40')
    expect(result.plan_version?.version).toBe(2)
    expect(result.diff).toEqual([{ field: 'protein_g', weekday: null, from: 130, to: 140 }])
    expect(result.applied.map((a) => a.index)).toEqual([0, 2])
    expect(result.dropped).toEqual([
      expect.objectContaining({ index: 1, kind: 'target', rule: 'calorie_floor' }),
    ])
    expect((await listVersions(deps)).length).toBe(before + 1)

    const review = await getReview(deps, '2026-W40')
    expect(review.author).toBe('claude_mcp')
    expect(review.narrative).toContain('Protein goes up to 140 g')
    const today = (await callTool(deps, 'get_today', {})) as { note: { text: string } | null }
    expect(today.note?.text).toBe('Protein first at every meal.')

    const reverted = (await callTool(deps, 'revert_review', {
      review_id: result.review_id,
    })) as RevertReviewResult
    expect(reverted.plan_version?.version).toBe(3)
    expect(reverted.undone).toEqual(['dashboard note removed'])
    const [active] = await listVersions(deps)
    expect(active!.targets.defaults.protein_g).toBe(130)
    const again = (await callTool(deps, 'revert_review', {
      review_id: result.review_id,
    })) as RevertReviewResult
    expect(again.already_reverted).toBe(true)
  })

  it('apply_review is not available to Ask AI', async () => {
    await expect(
      callTool({ ...deps, actor: 'ai' }, 'apply_review', { summary: 's', narrative: 'n', changes: [] }),
    ).rejects.toMatchObject({ status: 403, code: 'needs_approval' })
  })
})
