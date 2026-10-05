// Owns: tests at the cron seam (runCron) for retries — a cron run that throws releases its claim and the next tick
// redoes it, so a redo must not apply anything twice: the Monday nightly's weekly expenditure re-estimate (SPEC §9,
// tdee_est = round(0.5 × clamp(raw, 1,200, 4,500) + 0.5 × previous)) is applied once even when a later nightly step
// failed on the first tick, a planned fast's start card whose queueing failed is retried on the next tick, and the
// first nightly after missed days still releases the proposals scheduled for those days (the since-poll delivers them).
// Failures are simulated at the D1 seam: the next insert into ai_jobs throws once, as a dropped D1 connection does.
import { ReminderKind, type ReminderPrefs } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { and, eq, sql } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { runCron } from '../src/cron'
import { ai_events, ai_jobs, createDb, fast_logs, meal_items, meals, plan_versions, profile, settings, weight_logs, type Db } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { ensureTargetsThrough } from '../src/modules/plan'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
afterEach(async () => {
  await Promise.all(pending.splice(0))
})
const reminders = Object.fromEntries(ReminderKind.options.map((k) => [k, { enabled: true, time: null }])) as ReminderPrefs

/** `db`, except that the next insert into ai_jobs throws (once). */
function dbFailingNextJobInsert(): Db {
  let armed = true
  return new Proxy(db, {
    get(target, prop) {
      if (prop === 'insert')
        return (table: Parameters<Db['insert']>[0]) => {
          if (armed && table === ai_jobs) {
            armed = false
            throw new Error('D1_ERROR: Network connection lost.')
          }
          return target.insert(table)
        }
      const value: unknown = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

const at = (now: string, database: Db = db): Deps => ({
  db: database,
  env,
  now: () => new Date(now),
  actor: 'ai',
  waitUntil: (p) => void pending.push(p.catch(() => undefined)),
})

/** Every day Sun 2026-09-27 … Sun 2026-10-11 eaten at 1,400 kcal; weight 95.0 kg at both ends (trend flat). */
const EATING = Array.from({ length: 15 }, (_, i) => new Date(Date.UTC(2026, 8, 27 + i)).toISOString().slice(0, 10))

beforeAll(async () => {
  await db.batch([
    db.insert(profile).values({ height_cm: 165.1, sex: 'male', goal_weight_kg: 65, goal_date: '2027-08-04', start_weight_kg: 95.1, start_date: '2026-09-20' }),
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
      forecast: { finish_date: '2027-06-17', weekly_rate_kg: 1.046, band: { low: 0.837, high: 1.256 }, tdee_est: 2551 },
    }),
    db.insert(weight_logs).values([
      { date: '2026-09-27', weight_kg: 95 },
      { date: '2026-10-11', weight_kg: 95 },
    ]),
    ...EATING.flatMap((date) => {
      const id = crypto.randomUUID()
      return [
        db.insert(meals).values({ id, date, slot: 'dinner', input_method: 'manual', status: 'confirmed' }),
        db.insert(meal_items).values({ meal_id: id, description: 'dinner', grams: 500, kcal: 1400, protein_g: 130, carbs_g: 119, fat_g: 45, fibre_g: 30 }),
      ]
    }),
  ])
  await ensureTargetsThrough(at('2026-10-12T19:00:00.000Z'), '2026-10-11')
})

const activeTdee = async () =>
  (await db.select({ forecast: plan_versions.forecast }).from(plan_versions).where(eq(plan_versions.active, true)))[0]?.forecast?.tdee_est

describe('nightly retry', () => {
  it('a Monday nightly redone after a failed later step re-estimates expenditure once: 1,976 kcal, not 1,688', async () => {
    // Mon 2026-10-12 13:00 and 13:05 MDT. as_of Sun 2026-10-11: 14 logged days at 1,400 kcal, flat trend →
    // raw = 1,400; tdee = round(0.5 × 1,400 + 0.5 × 2,551) = 1,976. Applied twice it would be
    // round(0.5 × 1,400 + 0.5 × 1,976) = 1,688. The first tick fails queueing today's AI workout (a training day).
    const first = await runCron(at('2026-10-12T19:00:00.000Z', dbFailingNextJobInsert()))
    const retry = await runCron(at('2026-10-12T19:05:00.000Z'))

    expect(first).toMatchObject({ ran: [], failed: ['nightly'] })
    expect(retry).toMatchObject({ ran: ['nightly'], failed: [] })
    expect(await activeTdee()).toBe(1976)
    // The retry did the rest of the nightly: today's workout draft is queued.
    const jobs = await db
      .select({ id: ai_jobs.id })
      .from(ai_jobs)
      .where(and(eq(ai_jobs.type, 'workout_generate'), sql`json_extract(${ai_jobs.payload}, '$.date') = '2026-10-12'`))
    expect(jobs).toHaveLength(1)
  })
})

describe('fast start card retry', () => {
  it('a planned fast whose day_adjustment job failed to queue on its start tick gets it on the next tick', async () => {
    // Planned for Mon 2026-10-12 19:00 MDT (2026-10-13T01:00Z), untouched since it was planned: it begins on its own.
    const fast = crypto.randomUUID()
    await db.insert(fast_logs).values({
      id: fast,
      started_at: '2026-10-13T01:00:00.000Z',
      start_date: '2026-10-12',
      planned: true,
      created_at: '2026-10-01T15:00:00.000Z',
      updated_at: '2026-10-01T15:00:00.000Z',
    })

    await runCron(at('2026-10-13T01:00:00.000Z', dbFailingNextJobInsert()))
    await runCron(at('2026-10-13T01:05:00.000Z'))

    const cards = await db
      .select({ id: ai_jobs.id })
      .from(ai_jobs)
      .where(and(eq(ai_jobs.type, 'day_adjustment'), sql`json_extract(${ai_jobs.payload}, '$.fast_id') = ${fast}`))
    expect(cards).toHaveLength(1)
  })
})

describe('nightly catch-up of scheduled proposals', () => {
  it('the first nightly after missed days releases the proposals due on those days, and not older ones again', async () => {
    // The last nightly ran for Mon 2026-10-12; none ran on Tue 13th or Wed 14th (Worker down). Thu 15th 13:00 MDT.
    const stamp = '2026-10-01T00:00:00.000Z'
    const proposal = (date: string) => ({
      id: crypto.randomUUID(),
      kind: 'proposal' as const,
      actor: 'ai' as const,
      date,
      summary: `Second step, due ${date}`,
      body: { kind: 'kcal' },
      proposal_status: 'pending' as const,
      created_at: stamp,
      updated_at: stamp,
    })
    const [p12, p14, p15] = [proposal('2026-10-12'), proposal('2026-10-14'), proposal('2026-10-15')]
    await db.insert(ai_events).values([p12, p14, p15])

    expect((await runCron(at('2026-10-15T19:00:00.000Z'))).ran).toEqual(['nightly'])

    const updated = async (id: string) => (await db.select({ u: ai_events.updated_at }).from(ai_events).where(eq(ai_events.id, id)))[0]?.u
    expect(await updated(p14.id)).toBe('2026-10-15T19:00:00.000Z')
    expect(await updated(p15.id)).toBe('2026-10-15T19:00:00.000Z')
    expect(await updated(p12.id)).toBe(stamp)
  })
})
