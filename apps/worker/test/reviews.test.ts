// Owns: tests at the reviews seam (modules/reviews index + the /api/reviews/:week/pdf route) — the engine's week metrics
// for a seeded week (2026-W40, Mon 2026-09-28 … Sun 2026-10-04) as literals, the weekly_review draft with a fake router
// (a +300 kcal proposal split by the guards into two ≤150 kcal steps), the engine fallback when the router fails, the
// skip when Claude already reviewed a week, next week's draft plan carrying the targets forward unchanged (a proposal
// reaches the week once, when accepted), the proposals and the review written together or not at all, and the PDF
// archive with and without the Browser Rendering binding; a week that has not started cannot be reviewed.
import { ReminderKind, type ReminderPrefs, type WeeklyReviewOutput } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  ai_events,
  ai_jobs,
  createDb,
  exercises,
  fast_logs,
  meal_items,
  meals,
  plan_versions,
  profile,
  session_sets,
  settings,
  sleep_logs,
  step_logs,
  water_logs,
  week_plans,
  weekly_reviews,
  weight_logs,
  workout_sessions,
} from '../src/db'
import type { AppEnv } from '../src/env'
import type { Deps } from '../src/lib/deps'
import { handleError } from '../src/middleware/errors'
import type { LlmRouter } from '../src/modules/llm'
import { buildWeeklyMetrics, draftWeeklyReview, requestWeeklyReview } from '../src/modules/reviews'
import { mountReviewsRoutes } from '../src/routes/reviews'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []

/** Sunday 2026-10-04 20:00 in Edmonton (MDT, UTC−6): when the weekly cron hook fires. */
const SUNDAY_EVENING = '2026-10-05T02:00:00.000Z'
const deps: Deps = {
  db,
  env,
  now: () => new Date(SUNDAY_EVENING),
  actor: 'ai',
  waitUntil: (p) => void pending.push(p.catch(() => undefined)),
}

const W40 = '2026-09-28'
const W41 = '2026-10-05'
const benchId = crypto.randomUUID()
const pressId = crypto.randomUUID()
const baseline = { kcal: 1400, protein_g: 130, carbs_g: 119, fat_g: 45, fibre_g: 30, water_ml: 3000, steps: 8000 }
const reminders = Object.fromEntries(ReminderKind.options.map((k) => [k, { enabled: true, time: null }])) as ReminderPrefs

/** Two confirmed meals a day: [lunch kcal, lunch protein, dinner kcal, dinner protein]; each item 50 g carbs, 10 g fat, 5 g fibre. */
const MEALS: Record<string, [number, number, number, number]> = {
  '2026-09-28': [600, 50, 800, 70], // 1,400 kcal, 120 g protein
  '2026-09-29': [700, 60, 700, 80], // 1,400 kcal, 140 g
  // 2026-09-30: the fast day, nothing eaten
  '2026-10-01': [500, 40, 1000, 90], // 1,500 kcal, 130 g
  '2026-10-02': [650, 55, 650, 55], // 1,300 kcal, 110 g
  // 2026-10-03: nothing logged
  '2026-10-04': [800, 70, 600, 60], // 1,400 kcal, 130 g
}

function mealRows(date: string, [lk, lp, dk, dp]: [number, number, number, number]) {
  return (['lunch', 'dinner'] as const).map((slot, i) => {
    const id = crypto.randomUUID()
    return [
      db.insert(meals).values({ id, date, slot, input_method: 'manual', status: 'confirmed' }),
      db.insert(meal_items).values({
        meal_id: id,
        description: slot,
        grams: 300,
        kcal: i === 0 ? lk : dk,
        protein_g: i === 0 ? lp : dp,
        carbs_g: 50,
        fat_g: 10,
        fibre_g: 5,
      }),
    ] as const
  })
}

const session = (date: string, start: string, end: string) => ({ id: crypto.randomUUID(), date, started_at: start, ended_at: end, origin: 'blank' as const })
const mon = session(W40, '2026-09-28T23:00:00.000Z', '2026-09-29T00:00:00.000Z')
const thu = session('2026-10-01', '2026-10-01T23:00:00.000Z', '2026-10-02T00:00:00.000Z')
const sets = (session_id: string, exercise_id: string, reps: number, load_kg: number) =>
  [0, 1, 2].map((set_index) => ({ session_id, exercise_id, set_index, reps, load_kg, completed: true }))

beforeAll(async () => {
  const exercise = { category: 'strength' as const, level: 'beginner' as const, instructions: [], image_paths: [], source: 'user' as const, custom: true }
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
      targets: { defaults: baseline, overrides: {} },
      forecast: { finish_date: '2027-06-17', weekly_rate_kg: 1.046, band: { low: 0.837, high: 1.256 }, tdee_est: 2551 },
    }),
    // Trend: 95.1 seeds it on 2026-09-26 and carries forward; 94.3 on Sunday → 95.1 + 0.25 × (94.3 − 95.1) = 94.9.
    db.insert(weight_logs).values([
      { date: '2026-09-26', weight_kg: 95.1 },
      { date: '2026-10-04', weight_kg: 94.3 },
    ]),
    ...Object.entries(MEALS).flatMap(([date, m]) => mealRows(date, m).flat()),
    db.insert(water_logs).values(
      [
        ['2026-09-28', 2500],
        ['2026-09-29', 3000],
        ['2026-09-30', 3500],
        ['2026-10-01', 2000],
        ['2026-10-03', 2500],
        ['2026-10-04', 3000],
      ].map(([date, amount_ml]) => ({ date: date as string, logged_at: `${date}T18:00:00.000Z`, amount_ml: amount_ml as number })),
    ),
    db.insert(step_logs).values([
      { date: '2026-09-28', steps: 8000 },
      { date: '2026-09-29', steps: 6000 },
      { date: '2026-09-30', steps: 10000 },
      { date: '2026-10-01', steps: 7000 },
    ]),
    db.insert(sleep_logs).values([
      { date: '2026-09-28', asleep_min: 420 },
      { date: '2026-09-29', asleep_min: 480 },
      { date: '2026-09-30', asleep_min: 450 },
    ]),
    // Wednesday 00:00–23:30 MDT: 23.5 h ≥ 95 % of 24 h → completed.
    db.insert(fast_logs).values({
      started_at: '2026-09-30T06:00:00.000Z',
      ended_at: '2026-10-01T05:30:00.000Z',
      start_date: '2026-09-30',
      end_date: '2026-09-30',
      planned: true,
    }),
    db.insert(exercises).values([
      { id: benchId, slug: 'test-bench', name: 'Dumbbell bench press', equipment: 'dumbbell', primary_muscles: ['chest'], secondary_muscles: ['triceps'], ...exercise },
      { id: pressId, slug: 'test-leg-press', name: 'Leg press', equipment: 'machine', primary_muscles: ['quadriceps'], secondary_muscles: ['glutes'], ...exercise },
    ]),
    db.insert(workout_sessions).values([
      mon,
      {
        ...thu,
        prs: [{ exercise_id: benchId, kind: 'best_e1rm', reps: 10, load_kg: 52.5, e1rm_kg: 70, previous_best_kg: 66.67, date: '2026-10-01' }],
      },
    ]),
    db.insert(session_sets).values([
      ...sets(mon.id, benchId, 10, 50),
      ...sets(mon.id, pressId, 8, 100),
      ...sets(thu.id, benchId, 10, 52.5),
      { session_id: thu.id, exercise_id: pressId, set_index: 3, reps: 8, load_kg: 100, completed: false },
    ]),
  ])
})

afterEach(async () => {
  await Promise.all(pending.splice(0))
})

/** A router that answers every complete() with `output` (or throws `fail`), counting calls. */
function fakeRouter(output: WeeklyReviewOutput | null, fail?: Error): LlmRouter & { calls: number } {
  const router = {
    calls: 0,
    async complete<T>() {
      router.calls++
      if (fail || !output) throw fail ?? new Error('no output')
      return { data: output as T, provider: 'fake', model: 'fake-1', latency_ms: 1, tokens_in: 10, tokens_out: 10, attempts: 1 }
    },
    async chat(): Promise<never> {
      throw new Error('chat is not used by the weekly review')
    },
  }
  return router
}

const day = { kcal: 1400, protein_g: 130, carbs_g: 119, fat_g: 45, fibre_g: 30 }
const weekPlan: WeeklyReviewOutput['week_plan'] = {
  targets: { mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day },
  sessions: { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null },
  water_ml: 3000,
  steps: 8000,
  fast_dates: [],
  scan_date: null,
  focus_note: 'Protein first at every meal.',
}

describe('buildWeeklyMetrics', () => {
  it('rolls 2026-W40 up from v_day, sessions and fasts', async () => {
    const m = await buildWeeklyMetrics(deps, W40)

    expect(m).toMatchObject({
      week: '2026-W40',
      week_start: W40,
      trend_start_kg: 95.1,
      trend_end_kg: 94.9,
      trend_change_kg: -0.2,
      // 7,000 kcal and 630 g protein over 6 logged days (the fast day counts at 0); 500 g carbs, 100 g fat, 50 g fibre.
      intake_avg: { kcal: 1167, protein_g: 105, carbs_g: 83.3, fat_g: 16.7, fibre_g: 8.3 },
      target_kcal_avg: 1400,
      target_protein_g: 130,
      days_logged: 6,
      protein_adherence: 0.6, // 3 of 5 eating days at ≥ 130 g
      water_avg_ml: 2750, // 16,500 ml over 6 days with water
      steps_avg: 7750, // 31,000 over 4 days
      sleep_avg_min: 450, // 1,350 min over 3 nights
      sessions_done: 2,
      sessions_planned: 4, // Mon–Thu
      muscle_scores: { chest: 6, triceps: 3, quadriceps: 3, glutes: 1.5 },
      volume_kg: 5475, // 1,500 + 2,400 + 1,575
      volume_by_muscle: { chest: 3075, triceps: 1538, quadriceps: 2400, glutes: 1200 },
      logging_adherence: 0.143, // only Sunday has a weigh-in, two meals and water
      fasts: [{ hours: 23.5, status: 'completed' }],
      prs: [{ exercise_id: benchId, exercise_name: 'Dumbbell bench press', kind: 'best_e1rm' }],
      scan: null,
    })
    // Mean protein 126 g on eating days < 130 g target.
    expect(m.flags.map((f) => f.kind)).toEqual(['protein_low'])
  })
})

describe('draftWeeklyReview', () => {
  it('writes the Gemini review and routes a +300 kcal proposal through the guards as two ≤150 kcal steps', async () => {
    const llm = fakeRouter({
      narrative: 'Trend down 0.2 kg on a 1,167 kcal average. Protein first next week.',
      highlights: ['Fast completed'],
      concerns: ['Protein under target on 2 of 5 eating days'],
      proposals: [{ field: 'kcal', weekday: null, from: 1400, to: 1700, reason: 'Hunger and two missed days' }],
      week_plan: weekPlan,
    })

    const outcome = await draftWeeklyReview(deps, llm, W40)

    expect(outcome).toMatchObject({ status: 'written', source: 'llm' })
    const review = outcome.review!
    expect(review).toMatchObject({ week: '2026-W40', author: 'gemini', highlights: ['Fast completed'], pdf_url: null })
    expect(review.metrics.intake_avg.kcal).toBe(1167)
    expect(review.proposals.map((p) => [p.field, p.from, p.to, p.status, p.note])).toEqual([
      ['kcal', 1400, 1550, 'pending', 'Step 1 of 2'],
      ['kcal', 1550, 1700, 'pending', 'Step 2 of 2, due 2026-10-11'],
    ])
    for (const p of review.proposals) expect(Math.abs(p.to - p.from)).toBeLessThanOrEqual(150)

    const events = await db.select().from(ai_events).where(eq(ai_events.kind, 'review'))
    expect(events).toEqual([expect.objectContaining({ actor: 'ai', body: { review_id: review.id, week_start: W40 } })])
    const proposals = await db.select().from(ai_events).where(and(eq(ai_events.kind, 'proposal'), eq(ai_events.actor, 'ai')))
    expect(proposals.map((p) => p.proposal_status)).toEqual(['pending', 'pending'])
  })

  it('still writes the week when the router fails: engine narrative, no proposals, the earlier draft withdrawn', async () => {
    const outcome = await draftWeeklyReview(deps, fakeRouter(null, new Error('ProvidersExhausted')), W40)

    expect(outcome).toMatchObject({ status: 'written', source: 'engine' })
    expect(outcome.review!.proposals).toEqual([])
    expect(outcome.review!.narrative).toContain('Trend weight 95.1 → 94.9 kg (−0.2 kg)')
    expect(outcome.review!.concerns[0]).toMatch(/protein/i)
    // The first draft's two pending steps were withdrawn when this draft replaced it.
    const proposals = await db.select().from(ai_events).where(eq(ai_events.kind, 'proposal'))
    expect(proposals.map((p) => p.proposal_status)).toEqual(['rejected', 'rejected'])
    expect(await db.select().from(weekly_reviews)).toHaveLength(1)
  })

  it('skips a week Claude already reviewed, without calling the router', async () => {
    const metrics = await buildWeeklyMetrics(deps, W41)
    await db.insert(weekly_reviews).values({
      week_start: W41,
      author: 'claude_mcp',
      metrics,
      narrative: 'Claude: hold 1,400 kcal, add a set on leg press.',
      highlights: [],
      concerns: [],
      proposals: [],
    })
    const llm = fakeRouter({ narrative: 'Gemini', highlights: [], concerns: [], proposals: [], week_plan: weekPlan })

    const outcome = await draftWeeklyReview(deps, llm, W41)

    expect(outcome.status).toBe('skipped')
    expect(llm.calls).toBe(0)
    const [row] = await db.select().from(weekly_reviews).where(eq(weekly_reviews.week_start, W41))
    expect(row).toMatchObject({ author: 'claude_mcp', narrative: 'Claude: hold 1,400 kcal, add a set on leg press.' })
  })
})

describe('requestWeeklyReview', () => {
  it('refuses a week that has not started (no review of days still to come, no job queued)', async () => {
    const jobs = async () => (await db.select().from(ai_jobs).where(eq(ai_jobs.type, 'weekly_review'))).length
    const before = await jobs()

    await expect(requestWeeklyReview(deps, '2026-W42')).rejects.toMatchObject({ status: 400 })

    expect(await jobs()).toBe(before)
    expect(await db.select().from(weekly_reviews).where(eq(weekly_reviews.week_start, '2026-10-12'))).toEqual([])
  })
})

describe('draftWeeklyReview: proposals and next week', () => {
  const pendingByAi = async () =>
    (await db.select().from(ai_events).where(and(eq(ai_events.kind, 'proposal'), eq(ai_events.actor, 'ai'), eq(ai_events.proposal_status, 'pending')))).length
  const raise = (to: number): WeeklyReviewOutput => ({
    narrative: 'More energy for training.',
    highlights: [],
    concerns: [],
    proposals: [{ field: 'kcal', weekday: null, from: 1400, to, reason: 'Hunger' }],
    // The model applied its own proposal to next week (the prompt used to ask for that).
    week_plan: { ...weekPlan, targets: Object.fromEntries(Object.keys(weekPlan.targets).map((w) => [w, { ...day, kcal: to }])) as WeeklyReviewOutput['week_plan']['targets'] },
  })

  it('writes no proposal when the review write fails (a deadline mid-draft): they land together or not at all', async () => {
    const before = await pendingByAi()
    // The batch that stores the review row fails, as if the job's 25 s deadline hit it.
    const failing = new Proxy(db, {
      get(target, key, receiver) {
        if (key !== 'batch') return Reflect.get(target, key, receiver)
        return (statements: { toSQL?: () => { sql: string } }[]) => {
          if (statements.some((st) => st.toSQL?.().sql.includes('"weekly_reviews"'))) return Promise.reject(new Error('deadline'))
          return target.batch(statements as unknown as Parameters<typeof target.batch>[0])
        }
      },
    })

    await expect(draftWeeklyReview({ ...deps, db: failing }, fakeRouter(raise(1700)), W40)).rejects.toThrow('deadline')

    expect(await pendingByAi()).toBe(before)
  })

  it("stores next week's draft with the current targets: an accepted proposal reaches the week once, through the plan", async () => {
    const outcome = await draftWeeklyReview(deps, fakeRouter(raise(1550)), W40)

    expect(outcome.review!.proposals.map((p) => [p.from, p.to, p.status])).toEqual([[1400, 1550, 'pending']])
    const [draft] = await db.select().from(week_plans).where(and(eq(week_plans.week_start, W41), eq(week_plans.status, 'proposed')))
    expect(Object.values((draft!.plan as WeeklyReviewOutput['week_plan']).targets).map((t) => t.kcal)).toEqual(Array(7).fill(1400))
  })
})

describe('POST /api/reviews/:week/pdf', () => {
  // Only the reviews route group (auth is the auth test's seam: here the request is Aaron's, as auth() would set it),
  // with the app's JSON error body.
  const app = new Hono<AppEnv>()
  app.use('*', async (c, next) => {
    c.set('actor', 'user')
    await next()
  })
  mountReviewsRoutes(app)
  app.onError(handleError)
  const post = (bindings: object) => app.request('http://localhost/api/reviews/2026-W40/pdf', { method: 'POST' }, bindings)

  it('answers 501 pdf_unavailable without the Browser Rendering binding (local dev)', async () => {
    const res = await post({ ...env, BROWSER: undefined })
    expect(res.status).toBe(501)
    expect(await res.json()).toEqual({ error: 'pdf_unavailable', message: 'PDF archive works on the deployed Worker; use Print' })
  })

  it('renders the print page through the binding into R2 reports/2026-W40.pdf and returns a signed link', async () => {
    const calls: { url?: unknown; pdfOptions?: unknown; setExtraHTTPHeaders?: unknown }[] = []
    const BROWSER = {
      quickAction: async (_action: 'pdf', options: (typeof calls)[number]) => {
        calls.push(options)
        return new Response('%PDF-1.7 fake', { headers: { 'content-type': 'application/pdf' } })
      },
    }
    const res = await post({ ...env, BROWSER, ACCESS_CLIENT_ID: 'id.access', ACCESS_CLIENT_SECRET: 'secret' })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ key: 'reports/2026-W40.pdf', url: expect.stringMatching(/^\/api\/files\/reports%2F2026-W40\.pdf\?exp=/) })
    expect(calls[0]).toMatchObject({
      url: `${env.APP_ORIGIN}/reports/week/2026-W40?print=1`,
      setExtraHTTPHeaders: { 'CF-Access-Client-Id': 'id.access', 'CF-Access-Client-Secret': 'secret' },
      pdfOptions: { format: 'letter', printBackground: true },
    })
    expect(await (await env.FILES.get('reports/2026-W40.pdf'))?.text()).toBe('%PDF-1.7 fake')
    const [row] = await db.select().from(weekly_reviews).where(eq(weekly_reviews.week_start, W40))
    expect(row?.pdf_path).toBe('reports/2026-W40.pdf')
  })
})
