// Owns: tests at the cron and nightly-workout seams — a weekly review missed on Sunday evening runs once on Monday
// morning for the week just ended, and the nightly AI workout follows the day's planned training (the active week
// plan's sessions), not only settings.training_days. Today is Monday 2026-10-05; training days Mon–Thu (SPEC §12).
import { ReminderKind, type ReminderPrefs, type WeekPlanContentInput } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { runCron } from '../src/cron'
import { createDb, exercises, plan_versions, profile, settings, type NewRow } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { applyWeekPlan, proposeWeekPlan } from '../src/modules/week-plans'
import { planNextTrainingDay } from '../src/modules/workouts-ai'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
const at = (now: string, actor: Deps['actor'] = 'ai'): Deps => ({
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
const lifts = [ex('barbell-bench-press', 'barbell', ['chest']), ex('wide-grip-lat-pulldown', 'cable', ['lats']), ex('seated-cable-rows', 'cable', ['middle back']), ex('dumbbell-shoulder-press', 'dumbbell', ['shoulders'])]

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
    ...lifts.map((e) => db.insert(exercises).values(e)),
  ])
})

describe('weekly review catch-up', () => {
  it("runs a Sunday the cron missed on Monday morning, once, for the week just ended", async () => {
    // Monday 2026-10-05 09:00 and 09:05 MDT; no tick claimed 2026-W40 on Sunday evening.
    const first = await runCron(at('2026-10-05T15:00:00.000Z'))
    const again = await runCron(at('2026-10-05T15:05:00.000Z'))

    expect(first.ran).toContain('weekly')
    expect(again.ran).not.toContain('weekly')
  })

  it('a week claimed on Sunday evening is not run again on Monday', async () => {
    const sunday = await runCron(at('2026-10-12T02:30:00.000Z')) // Sun 2026-10-11 20:30 MDT, 2026-W41
    const monday = await runCron(at('2026-10-12T15:00:00.000Z'))

    expect(sunday.ran).toContain('weekly')
    expect(monday.ran).not.toContain('weekly')
  })
})

describe('nightly AI workout', () => {
  it("skips a Monday the active week plan leaves without a session (its training is on Tuesday)", async () => {
    const day = { kcal: 1400, protein_g: 130, carbs_g: 119, fat_g: 45, fibre_g: 30 }
    const set = (e: Ex) => ({ exercise_id: e.id, sets: 4, rep_min: 8, rep_max: 12, target_load_kg: null, rest_sec: 90, note: null })
    const plan: WeekPlanContentInput = {
      targets: { mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day },
      sessions: { mon: null, tue: { template_id: null, name: 'Upper A', exercises: lifts.map(set) }, wed: null, thu: null, fri: null, sat: null, sun: null },
      water_ml: 3000,
      steps: 8000,
      fast_dates: [],
      scan_date: null,
      focus_note: 'One session this week.',
    }
    const monday = '2026-10-19T15:00:00.000Z'
    const { week_plan } = await proposeWeekPlan(at(monday, 'user'), { week_start: '2026-10-19', plan })
    await applyWeekPlan(at(monday, 'user'), week_plan!.id)

    expect(await planNextTrainingDay(at(monday), '2026-10-19')).toMatchObject({ job_id: null, reason: 'not a training day' })
  })
})
