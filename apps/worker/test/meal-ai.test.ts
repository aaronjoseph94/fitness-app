// Owns: tests at the meal-ai seam (through the job queue, with a fake LLM router and fake food sources): a text meal
// becomes an editable item list in review; a router failure leaves the meal in review with its raw text and fails or
// requeues the job; a photo upload is analysed from its R2 bytes; the sweep auto-confirms a sure meal after 10 min;
// the day_adjustment card's numbers come from the day's targets and intake, never from the LLM.
import type { MealAnalysisOutput } from '@fitness/shared/schemas'
import { ReminderKind, type ReminderPrefs } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { and, eq, sql } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ai_events, ai_jobs, createDb, foods, plan_versions, profile, settings } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { nutritionFor, type FoodRow, type FoodSources } from '../src/modules/food-sources'
import { enqueue, runJob, sweep } from '../src/modules/jobs'
import { ProvidersExhaustedError, type CompleteRequest, type CompleteResult, type LlmRouter } from '../src/modules/llm'
import { registerMealAiJobs } from '../src/modules/meal-ai'
import { addMealPhoto, createFavourite, createFood, createMeal, getMeal } from '../src/modules/nutrition'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
const T0 = '2026-10-05T18:00:00.000Z' // 12:00 in Edmonton on 2026-10-05
const at = (iso: string): Deps => ({ db, env, now: () => new Date(iso), actor: 'user', waitUntil: (p) => void pending.push(p) })
const later = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString()
const settle = () => Promise.all(pending.splice(0))

// ── Fakes at the adapter seam ─────────────────────────────────────────────────────────────────────────────────

type Reply = (req: CompleteRequest<unknown>) => unknown
const routerCalls: CompleteRequest<unknown>[] = []
let reply: Reply = () => {
  throw new Error('no reply set')
}
const fakeRouter: Pick<LlmRouter, 'complete'> = {
  async complete<T>(req: CompleteRequest<T>): Promise<CompleteResult<T>> {
    routerCalls.push(req as CompleteRequest<unknown>)
    const data = req.schema.parse(reply(req as CompleteRequest<unknown>))
    return { data, provider: 'fake', model: 'fake-flash', latency_ms: 3, tokens_in: 120, tokens_out: 60, attempts: 1 }
  },
}

/** Database matches by item name: [food id, match score]. Anything else is unmatched (the LLM estimate is used). */
const matches = new Map<string, [string, number]>()
const fakeFoods: FoodSources = {
  byBarcode: async () => null,
  search: async () => [],
  nutritionFor,
  async matchItem(item) {
    const m = matches.get(item.name)
    if (!m) return null
    const [food] = await db.select().from(foods).where(eq(foods.id, m[0]))
    return { food: food as FoodRow, confidence: m[1], estimated: false, nutrients: nutritionFor(food!, item.grams) }
  },
}

const ids = { egg: crypto.randomUUID(), toast: crypto.randomUUID(), chicken: crypto.randomUUID(), rice: crypto.randomUUID() }
const item = (name: string, grams: number, confidence: number, estimate: MealAnalysisOutput['items'][number]['estimate'] = null) => ({
  name,
  grams,
  confidence,
  candidates: [],
  estimate,
})

beforeAll(async () => {
  const reminders = Object.fromEntries(ReminderKind.options.map((k) => [k, { enabled: true, time: null }])) as ReminderPrefs
  // Plan v1 (SPEC §6): 1,400 kcal, 130 g protein, 45 g fat, 30 g fibre, carbs the remainder (118.75 g).
  const baseline = { kcal: 1400, protein_g: 130, carbs_g: 118.75, fat_g: 45, fibre_g: 30, water_ml: 3000, steps: 8000 }
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
  ])
  const deps = at(T0)
  // Per 100 g.
  await createFood(deps, { id: ids.egg, name: 'Egg, chicken, whole, raw', kcal_per_100g: 143, protein_g: 12.6, carbs_g: 0.7, fat_g: 9.5, fibre_g: 0 })
  await createFood(deps, { id: ids.toast, name: 'Bread, white, toasted', kcal_per_100g: 293, protein_g: 9, carbs_g: 54, fat_g: 4, fibre_g: 2.5 })
  await createFood(deps, { id: ids.chicken, name: 'Chicken breast', kcal_per_100g: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, fibre_g: 0 })
  await createFood(deps, { id: ids.rice, name: 'Rice, cooked', kcal_per_100g: 130, protein_g: 2.6, carbs_g: 28, fat_g: 0.4, fibre_g: 0.4 })
  matches.set('eggs, scrambled', [ids.egg, 0.95])
  matches.set('white toast', [ids.toast, 0.82])
  matches.set('chicken breast, grilled', [ids.chicken, 0.9])
  registerMealAiJobs({ router: () => fakeRouter, foodSources: () => fakeFoods })
})

afterEach(async () => {
  await settle()
  routerCalls.length = 0
})

const jobsFor = (mealId: string) =>
  db
    .select()
    .from(ai_jobs)
    .where(and(eq(ai_jobs.type, 'meal_analysis'), sql`json_extract(${ai_jobs.payload}, '$.meal_id') = ${mealId}`))

describe('meal_analysis', () => {
  it('turns a text meal into matched and estimated items in review, with provider bookkeeping and a note', async () => {
    reply = () => ({
      items: [item('eggs, scrambled', 100, 0.9), item('white toast', 60, 0.85), item('black coffee', 240, 0.9, { kcal: 1, protein_g: 0.1, carbs_g: 0, fat_g: 0, fibre_g: 0 })],
      notes: '',
    })
    const meal = await createMeal(at(T0), { id: crypto.randomUUID(), slot: 'lunch', eaten_at: T0, input_method: 'text', raw_text: "Aaron's usual: 2 eggs, toast, black coffee" })
    await settle()

    // The LLM saw the meal text without Aaron's name, and no image.
    expect(routerCalls).toHaveLength(1)
    expect(routerCalls[0]!.messages[0]!.content).toContain(`"""the user's usual: 2 eggs, toast, black coffee"""`)
    expect(routerCalls[0]!.images).toBeUndefined()

    const analysed = await getMeal(at(T0), meal.id)
    expect(analysed.status).toBe('review')
    expect(analysed.raw_text).toBe("Aaron's usual: 2 eggs, toast, black coffee")
    // 100 g egg = 143 kcal; 60 g toast = 175.8 kcal; 240 g coffee at the LLM's 1 kcal/100 g = 2.4 kcal.
    expect(analysed.items.map((i) => [i.description, i.food_id, i.kcal, i.confidence, i.estimated])).toEqual([
      ['Eggs, scrambled', ids.egg, 143, 0.9, false],
      ['White toast', ids.toast, 175.8, 0.82, false],
      ['Black coffee', null, 2.4, 0.6, true],
    ])
    expect(analysed.totals.kcal).toBe(321.2)

    const [job] = await jobsFor(meal.id)
    expect(job).toMatchObject({ status: 'done', provider: 'fake', model: 'fake-flash', tokens_in: 120, tokens_out: 60, attempts: 1 })
    const [note] = await db.select().from(ai_events).where(eq(ai_events.job_id, job!.id))
    expect(note).toMatchObject({ kind: 'note', actor: 'ai', date: '2026-10-05', summary: 'Lunch: 3 items, about 321 kcal (1 estimated). Check and confirm.' })
  })

  it('leaves the meal in review with its raw text when no provider answers: failed, or requeued for a quota', async () => {
    reply = () => {
      throw new ProvidersExhaustedError([{ provider: 'gemini', model: 'gemini-3.8-flash', reason: 'server', status: 503 }])
    }
    const down = await createMeal(at(T0), { id: crypto.randomUUID(), slot: 'dinner', eaten_at: T0, input_method: 'voice', raw_text: 'pasta with tomato sauce' })
    await settle()

    expect(await getMeal(at(T0), down.id)).toMatchObject({ status: 'review', raw_text: 'pasta with tomato sauce', items: [] })
    expect((await jobsFor(down.id))[0]).toMatchObject({ status: 'failed', attempts: 1, error: expect.stringContaining('gemini/gemini-3.8-flash=server(503)') })

    reply = () => {
      throw new ProvidersExhaustedError([
        { provider: 'gemini', model: 'gemini-3.8-flash', reason: 'quota' },
        { provider: 'zai', model: 'glm-4.7-flash', reason: 'no_key' },
      ])
    }
    const quota = await createMeal(at(T0), { id: crypto.randomUUID(), slot: 'snack', eaten_at: T0, input_method: 'text', raw_text: 'an apple' })
    await settle()

    expect(await getMeal(at(T0), quota.id)).toMatchObject({ status: 'review', raw_text: 'an apple', items: [] })
    expect((await jobsFor(quota.id))[0]).toMatchObject({ status: 'queued', attempts: 1, run_after: '2026-10-05T19:00:00.000Z' })
  })

  it('stores an uploaded photo in R2 and analyses the meal from its bytes', async () => {
    reply = () => ({ items: [item('chicken breast, grilled', 150, 0.7)], notes: 'Portion judged from the plate.' })
    const meal = await createMeal(at(T0), { id: crypto.randomUUID(), slot: 'dinner', eaten_at: T0, input_method: 'photo' })
    expect(meal.status).toBe('parsing')

    const photoId = crypto.randomUUID()
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).buffer
    const photo = await addMealPhoto(at(T0), meal.id, { photo_id: photoId, width: 1024, height: 768, content_type: 'image/jpeg' }, bytes)
    await settle()

    expect(photo.url).toMatch(new RegExp(`^/api/files/${encodeURIComponent(`meal-photos/${meal.id}/${photoId}.jpg`)}\\?exp=`))
    const stored = await env.FILES.get(`meal-photos/${meal.id}/${photoId}.jpg`)
    expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(new Uint8Array(bytes))
    expect(routerCalls[0]!.images).toEqual([{ mime: 'image/jpeg', data: bytes }])
    expect(await getMeal(at(T0), meal.id)).toMatchObject({
      status: 'review',
      items: [{ description: 'Chicken breast, grilled', food_id: ids.chicken, grams: 150, kcal: 247.5, confidence: 0.7 }],
      photos: [{ id: photoId, width: 1024, height: 768, exif_stripped: true }],
    })
  })

  it('auto-confirms a review meal whose every item is ≥ 0.8 sure after 10 minutes, then writes the day card', async () => {
    reply = (req) =>
      req.job === 'meal_analysis'
        ? { items: [item('chicken breast, grilled', 200, 0.95)], notes: '' }
        : { why: [], note: 'Plenty of room left for dinner.' }
    const meal = await createMeal(at(T0), { id: crypto.randomUUID(), slot: 'lunch', eaten_at: T0, input_method: 'text', raw_text: '200 g grilled chicken breast' })
    await settle()
    expect((await getMeal(at(T0), meal.id)).items[0]?.confidence).toBe(0.9)

    expect((await sweep(at(later(5)))).steps.meal_auto_confirm).toBe(0)
    expect((await getMeal(at(T0), meal.id)).status).toBe('review')

    const tick = await sweep(at(later(11)))
    await settle()
    expect(tick.steps.meal_auto_confirm).toBe(1)
    expect((await getMeal(at(T0), meal.id)).status).toBe('confirmed')
    const cards = await db.select().from(ai_events).where(and(eq(ai_events.kind, 'adjustment'), eq(ai_events.date, '2026-10-05')))
    expect(cards.map((c) => (c.body as { note: string }).note)).toEqual(['Plenty of room left for dinner.'])
  })
})

describe('day_adjustment', () => {
  it('takes remaining kcal, macros and protein status from the day, and suggests favourites that fit', async () => {
    const deps = at(T0)
    // 2026-10-03: one confirmed dinner, 200 g chicken (330 kcal, 62 g protein, 7.2 g fat) + 150 g rice (195 kcal,
    // 3.9 g protein, 42 g carbs, 0.6 g fat) = 525 kcal, 65.9 g protein, 42 g carbs, 7.8 g fat.
    const dinner = await createMeal(deps, {
      id: crypto.randomUUID(),
      slot: 'dinner',
      eaten_at: '2026-10-04T00:30:00.000Z',
      input_method: 'manual',
      items: [
        { id: crypto.randomUUID(), food_id: ids.chicken, grams: 200 },
        { id: crypto.randomUUID(), food_id: ids.rice, grams: 150 },
      ],
    })
    const fits = await createFavourite(deps, { id: crypto.randomUUID(), kind: 'food', label: 'Chicken breast', food_id: ids.chicken, default_grams: 150 })
    await createFavourite(deps, { id: crypto.randomUUID(), kind: 'food', label: 'Big rice bowl', food_id: ids.rice, default_grams: 800 })
    // The LLM may only word the card; whatever it says, the numbers are the app's.
    reply = () => ({ why: ['Lean protein for the 64 g still to go.'], note: 'Room for a solid dinner.' })

    const job = await enqueue(deps, { type: 'day_adjustment', payload: { date: '2026-10-03', trigger: 'meal_confirmed', meal_id: dinner.id, fast_id: null } })
    expect(await runJob(deps, job.id)).toEqual({ id: job.id, status: 'done' })

    const [card] = await db.select().from(ai_events).where(eq(ai_events.job_id, job.id))
    expect(card).toMatchObject({ kind: 'adjustment', date: '2026-10-03', summary: '875 kcal left today' })
    // The day's targets: 1,400 kcal, 130 g protein, 45 g fat, carbs round((1,400 − 520 − 405) / 4) = 119 g (engine).
    // 1,400 − 525 = 875 kcal; 130 − 65.9 = 64.1 g protein; 119 − 42 = 77 g carbs; 45 − 7.8 = 37.2 g fat.
    // Protein: 4 × 64.1 = 256.4 ≤ 0.5 × 875 = 437.5 → ok. 150 g chicken = 247.5 kcal fits; 800 g rice = 1,040 does not.
    expect(card!.body).toEqual({
      date: '2026-10-03',
      remaining: { kcal: 875, protein_g: 64.1, carbs_g: 77, fat_g: 37.2 },
      status: 'ok',
      suggestions: [{ favorite_id: fits.id, description: 'Chicken breast', grams: 150, why: 'Lean protein for the 64 g still to go.' }],
      note: 'Room for a solid dinner.',
    })

    // No provider answers: the same numbers, written with plain text.
    reply = () => {
      throw new ProvidersExhaustedError([{ provider: 'gemini', model: 'gemini-3.8-flash', reason: 'no_key' }])
    }
    const offline = await enqueue(deps, { type: 'day_adjustment', payload: { date: '2026-10-03', trigger: 'meal_confirmed', meal_id: dinner.id, fast_id: null } })
    expect(await runJob(deps, offline.id)).toEqual({ id: offline.id, status: 'done' })
    const [plain] = await db.select().from(ai_events).where(eq(ai_events.job_id, offline.id))
    expect(plain!.body).toMatchObject({
      remaining: { kcal: 875, protein_g: 64.1, carbs_g: 77, fat_g: 37.2 },
      suggestions: [{ favorite_id: fits.id, why: '248 kcal and 47 g protein, inside the 875 kcal left.' }],
      note: '875 kcal and 64 g protein left today.',
    })
  })
})
