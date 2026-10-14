// Owns: tests at the workouts-ai seam for planning the whole week (plan 2026-10-14-ai-runs-train-three-day-week, Task 4).
// "Plan my week" with Mon, Tue, Thu moves the days first (a proposal for Ask AI, saved at once for Aaron), then queues one
// workout_template job per split day at user priority — Upper A, Lower A, Full body — marking the days whose template it
// would replace; pressed again while they wait it queues nothing, and with no model key it refuses (409) before writing
// anything. Each split draft must reach its day's body groups (engine focusGroups): a reply that misses one gains the
// best allowed candidate for it (3 sets). trainingWeek shows each day's template, draft and job, and the body groups no
// template reaches yet. Mon 2026-10-12 noon in Edmonton.
import { DEFAULT_REMINDER_PREFS, PlanWeekResult, TrainingWeek, type SplitSlot, type TemplateExerciseInput } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ai_events, ai_jobs, createDb, exercises, plan_versions, profile, settings, template_exercises, workout_templates, type NewRow } from '../src/db'
import type { Env } from '../src/env'
import type { Deps } from '../src/lib/deps'
import type { LlmRouter } from '../src/modules/llm'
import { getSettings, proposeTrainingDays } from '../src/modules/settings'
import { createTemplate } from '../src/modules/training'
import { draftWorkout, planTrainingWeek, trainingWeek } from '../src/modules/workouts-ai'

const db = createDb(env.DB)
const NOW = '2026-10-12T18:00:00.000Z'
const pending: Promise<unknown>[] = []
afterEach(async () => {
  await Promise.all(pending.splice(0))
})
/** Every provider key unset (app_secrets is empty too), so no model can answer. */
const MODEL_KEYS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_PAID_API_KEY', 'GEMINI_API_KEY', 'ZAI_API_KEY', 'OPENROUTER_API_KEY', 'GROQ_API_KEY'] as const
const noKeys: Env = { ...env, ...Object.fromEntries(MODEL_KEYS.map((k) => [k, undefined])) }
/**
 * Deps at NOW. A fake Groq key unless `keys: false`. The invocation's fetch tally is spent (limit 0), so queued jobs wait
 * for the sweep and no model is called here.
 */
const at = (actor: Deps['actor'], opts: { keys?: boolean } = {}): Deps => ({
  db,
  env: opts.keys === false ? noKeys : { ...noKeys, GROQ_API_KEY: 'test-key' },
  now: () => new Date(NOW),
  actor,
  waitUntil: (p) => void pending.push(p.catch(() => undefined)),
  budget: { limit: 0, used: 0 },
})

type Ex = NewRow<typeof exercises> & { id: string }
const ex = (slug: string, primary: Ex['primary_muscles'], equipment: string, mechanic: 'compound' | 'isolation' = 'compound'): Ex => ({
  id: crypto.randomUUID(),
  slug,
  name: slug,
  category: 'strength',
  equipment,
  mechanic,
  level: 'beginner',
  primary_muscles: primary,
  secondary_muscles: [],
  instructions: [],
  image_paths: [],
  source: 'free-exercise-db',
})
const bench = ex('barbell-bench-press', ['chest'], 'barbell')
const pulldown = ex('wide-grip-lat-pulldown', ['lats'], 'cable')
const row = ex('seated-cable-rows', ['middle back'], 'cable')
const press = ex('dumbbell-shoulder-press', ['shoulders'], 'dumbbell')
const curl = ex('dumbbell-bicep-curl', ['biceps'], 'dumbbell', 'isolation')
const pushdown = ex('triceps-pushdown', ['triceps'], 'cable', 'isolation')
const legPress = ex('leg-press', ['quadriceps'], 'machine')
const legCurl = ex('lying-leg-curls', ['hamstrings'], 'machine', 'isolation')
const hipThrust = ex('barbell-hip-thrust', ['glutes'], 'barbell')
const calfRaise = ex('standing-calf-raises', ['calves'], 'machine', 'isolation')
const library = [bench, pulldown, row, press, curl, pushdown, legPress, legCurl, hipThrust, calfRaise]

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
    ...library.map((e) => db.insert(exercises).values(e)), // one row per statement: ≤ 100 bound parameters
  ])
})

// Each test starts on Mon–Thu with no templates, events or jobs.
beforeEach(async () => {
  await db.batch([
    db.delete(ai_events),
    db.delete(ai_jobs),
    db.delete(template_exercises),
    db.delete(workout_templates),
    db.update(settings).set({ training_days: ['mon', 'tue', 'wed', 'thu'] }),
  ])
})

const sets = (n: number, ...list: Ex[]): TemplateExerciseInput[] =>
  list.map((e) => ({ exercise_id: e.id, sets: n, rep_min: 8, rep_max: 12, target_load_kg: null, rest_sec: 90, note: null }))
const template = async (name: string, list: TemplateExerciseInput[]) => {
  const id = crypto.randomUUID()
  await createTemplate(at('user'), { id, name, origin: 'custom', exercises: list })
  return id
}
const upperA = () => template('Upper A', sets(4, bench, pulldown, press, curl))
const jobsOf = async (ids: readonly string[]) => {
  const rows = await db.select().from(ai_jobs)
  return ids.map((id) => rows.find((r) => r.id === id)!)
}
const slotNames = (rows: { payload: unknown }[]) => rows.map((r) => (r.payload as { slot: SplitSlot }).slot.name)
/** A fake router answering these picks of 4 sets × 8–12 reps, 90 s rest. */
const llm = (slugs: string[], onPrompt: (prompt: string) => void = () => undefined): Pick<LlmRouter, 'complete'> => ({
  complete: async (req) => {
    onPrompt(req.messages.map((m) => m.content).join('\n'))
    const data = { exercises: slugs.map((exercise_id) => ({ exercise_id, sets: 4, rep_min: 8, rep_max: 12, load_kg: null, rest_sec: 90 })), rationale: 'A split day.' }
    return { data: data as never, provider: 'fake', model: 'fake', latency_ms: 1, tokens_in: 1, tokens_out: 1, attempts: 1 }
  },
})

describe('planTrainingWeek', () => {
  it('as ai: Mon, Tue, Thu is proposed (settings stay Mon–Thu) and Upper A, Lower A, Full body are queued; only Upper A replaces', async () => {
    await upperA()

    const out = await planTrainingWeek(at('ai'), { training_days: ['mon', 'tue', 'thu'] })

    expect(PlanWeekResult.safeParse(out).success).toBe(true)
    expect(out.training_days).toMatchObject({ status: 'proposed' })
    expect(out.training_days.proposal_id).not.toBeNull()
    expect((await getSettings(at('user'))).settings.training_days).toEqual(['mon', 'tue', 'wed', 'thu'])
    expect(out.slots.map((s) => s.name)).toEqual(['Upper A', 'Lower A', 'Full body'])
    expect(out.skipped).toEqual([])
    const jobs = await jobsOf(out.job_ids)
    expect(slotNames(jobs)).toEqual(['Upper A', 'Lower A', 'Full body'])
    expect(jobs.map((j) => [j.type, j.status, j.priority, (j.payload as { replace?: boolean }).replace ?? false])).toEqual([
      ['workout_template', 'queued', 10, true],
      ['workout_template', 'queued', 10, false],
      ['workout_template', 'queued', 10, false],
    ])
  })

  it('as Aaron: the days are saved at once', async () => {
    const out = await planTrainingWeek(at('user'), { training_days: ['mon', 'tue', 'thu'] })

    expect(out.training_days).toEqual({ status: 'applied', proposal_id: null })
    expect((await getSettings(at('user'))).settings.training_days).toEqual(['mon', 'tue', 'thu'])
    expect(out.job_ids).toHaveLength(3)
  })

  it('pressed again while the drafts wait: nothing more is queued and all three are skipped', async () => {
    await planTrainingWeek(at('ai'), { training_days: ['mon', 'tue', 'thu'] })

    const again = await planTrainingWeek(at('ai'), { training_days: ['mon', 'tue', 'thu'] })

    expect(again.job_ids).toEqual([])
    expect(again.skipped).toEqual(['Upper A', 'Lower A', 'Full body'])
    expect(await db.select().from(ai_jobs)).toHaveLength(3)
  })

  it('with no model key: 409 no_model_key, and nothing is queued or proposed', async () => {
    await expect(planTrainingWeek(at('ai', { keys: false }), { training_days: ['mon', 'tue', 'thu'] })).rejects.toMatchObject({
      status: 409,
      code: 'no_model_key',
    })
    expect(await db.select().from(ai_jobs)).toEqual([])
    expect(await db.select().from(ai_events)).toEqual([])
  })
})

describe('split drafts that cover the body', () => {
  it('an Upper A reply with chest, back and shoulders but no arms gains the best arms candidate, 3 sets', async () => {
    let prompt = ''
    const reply = llm(['barbell-bench-press', 'wide-grip-lat-pulldown', 'seated-cable-rows', 'dumbbell-shoulder-press'], (p) => (prompt = p))
    const slot: SplitSlot = { weekday: 'mon', name: 'Upper A', focus: 'upper' }

    const out = await draftWorkout(at('ai'), reply, { mode: 'generate', slot, priority: 'user' })

    expect(prompt).toContain('chest, back, shoulders, arms')
    const [event] = await db.select().from(ai_events).where(eq(ai_events.id, out.proposal_id!))
    const stored = (event!.body as { workout: { exercises: TemplateExerciseInput[] } }).workout.exercises
    expect(stored).toHaveLength(5)
    expect(stored.filter((e) => e.exercise_id === curl.id || e.exercise_id === pushdown.id)).toEqual([
      expect.objectContaining({ exercise_id: curl.id, sets: 3, rep_min: 8, rep_max: 12, rest_sec: 90 }),
    ])
  })

  it('Full body (days proposed, not yet tapped): every major group, every earlier day, and his current version to vary from', async () => {
    await upperA()
    await template('Lower A', sets(4, legPress, legCurl, hipThrust, calfRaise))
    await template('Full body', sets(3, bench, row, press, legPress, legCurl, hipThrust))
    await proposeTrainingDays(at('ai'), { training_days: ['mon', 'tue', 'thu'] })
    let prompt = ''
    const reply = llm(['barbell-bench-press', 'seated-cable-rows', 'dumbbell-shoulder-press', 'leg-press', 'lying-leg-curls', 'barbell-hip-thrust'], (p) => (prompt = p))
    const slot: SplitSlot = { weekday: 'thu', name: 'Full body', focus: 'full' }

    await draftWorkout(at('ai'), reply, { mode: 'generate', slot, replace: true, priority: 'user' })

    expect(prompt).toContain('Full body: every major muscle group, 12–28 sets')
    expect(prompt).toContain('chest, back, shoulders, quads, hamstrings, glutes')
    expect(prompt).toContain('Already in Upper A: barbell-bench-press, wide-grip-lat-pulldown, dumbbell-shoulder-press, dumbbell-bicep-curl')
    expect(prompt).toContain('Already in Lower A: leg-press, lying-leg-curls, barbell-hip-thrust, standing-calf-raises')
    expect(prompt).toContain(
      'The current Full body: barbell-bench-press, seated-cable-rows, dumbbell-shoulder-press, leg-press, lying-leg-curls, barbell-hip-thrust',
    )
  })
})

describe('trainingWeek', () => {
  it("Mon, Tue, Thu: Monday's Upper A, Tuesday's new Lower A draft, Thursday's job; the lower body is not covered yet", async () => {
    await db.update(settings).set({ training_days: ['mon', 'tue', 'thu'] })
    const upper = await upperA()
    const lowerDraft = crypto.randomUUID()
    await db.insert(ai_events).values({
      id: lowerDraft,
      kind: 'proposal',
      actor: 'ai',
      summary: 'Draft for Lower A',
      body: { kind: 'workout', mode: 'generate', date: null, workout: { name: 'Lower A', exercises: sets(4, legPress, legCurl, hipThrust, calfRaise), rationale: '' }, muscle_scores: {} },
      proposal_status: 'pending',
    })
    await db.insert(ai_jobs).values({ type: 'workout_template', status: 'queued', priority: 10, payload: { slot: { weekday: 'thu', name: 'Full body', focus: 'full' } } })

    const week = await trainingWeek(at('user'))

    expect(TrainingWeek.safeParse(week).success).toBe(true)
    expect(week.training_days).toEqual(['mon', 'tue', 'thu'])
    expect(week.slots.map((s) => [s.weekday, s.name, s.focus])).toEqual([
      ['mon', 'Upper A', 'upper'],
      ['tue', 'Lower A', 'lower'],
      ['thu', 'Full body', 'full'],
    ])
    expect(week.slots[0]).toMatchObject({ template: { id: upper, name: 'Upper A', exercise_count: 4, sets: 16 }, draft: null, drafting: false })
    expect(week.slots[0]!.template!.muscle_scores).toMatchObject({ chest: 4, lats: 4, shoulders: 4, biceps: 4 })
    expect(week.slots[1]).toMatchObject({ template: null, draft: { proposal_id: lowerDraft, replaces_template_id: null }, drafting: false })
    expect(week.slots[2]).toMatchObject({ template: null, draft: null, drafting: true })
    expect(week.uncovered).toEqual(['quads', 'hamstrings', 'glutes', 'calves'])
    expect(week.week_plan_sessions).toBeNull()
  })
})
