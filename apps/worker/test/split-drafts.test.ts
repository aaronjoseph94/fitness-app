// Owns: tests at the workouts-ai seam for the split's drafts (plan 2026-10-09-split-drafts-and-swap, decisions 3, 5,
// 7, 8, 9, 10). Training days Mon–Thu → Upper A, Lower A, Upper B, Lower B. ensureSplitDrafts queues one background
// workout_template job for the first day in split order with no template (name trimmed, case-insensitive), no pending
// draft and no draft dismissed in the last 28 days; nothing while one is queued or running, or within 24 h of a failed
// one. Drafts are read over that 28-day window, so a draft ignored longer is drafted afresh, and writing a split draft
// rejects the day's older pending drafts (one pending draft per day). A split draft is a template (no date, no day's
// cuts) that varies from the earlier day of its focus, and planNextTrainingDay leaves a day whose split template exists
// to that template.
import { ReminderKind, type ReminderPrefs, type SplitSlot } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ai_events, ai_jobs, createDb, exercises, plan_versions, settings, template_exercises, workout_templates, type NewRow } from '../src/db'
import type { Deps } from '../src/lib/deps'
import type { LlmRouter } from '../src/modules/llm'
import { createTemplate } from '../src/modules/training'
import { draftWorkout, ensureSplitDrafts, planNextTrainingDay } from '../src/modules/workouts-ai'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
const at = (iso: string, actor: Deps['actor'] = 'ai'): Deps => ({
  db,
  env,
  now: () => new Date(iso),
  actor,
  waitUntil: (p) => void pending.push(p.catch(() => undefined)),
})
afterEach(async () => {
  await Promise.all(pending.splice(0))
})
const reminders = Object.fromEntries(ReminderKind.options.map((k) => [k, { enabled: true, time: null }])) as ReminderPrefs

/** Fri 2026-10-09 10:00 in Edmonton. */
const NOW = '2026-10-09T16:00:00.000Z'
const hoursFrom = (iso: string, h: number) => new Date(Date.parse(iso) + h * 3_600_000).toISOString()
const UPPER_A: SplitSlot = { weekday: 'mon', name: 'Upper A', focus: 'upper' }

type Ex = NewRow<typeof exercises> & { id: string }
const ex = (slug: string, primary: Ex['primary_muscles'], equipment = 'cable'): Ex => ({
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
const bench = ex('barbell-bench-press', ['chest'], 'barbell')
const pulldown = ex('wide-grip-lat-pulldown', ['lats'])
const row = ex('seated-cable-rows', ['middle back'])
const press = ex('dumbbell-shoulder-press', ['shoulders'], 'dumbbell')

beforeAll(async () => {
  await db.batch([
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
    ...[bench, pulldown, row, press].map((e) => db.insert(exercises).values(e)),
  ])
})

// The tests share one database: each starts with no templates, drafts or jobs.
beforeEach(async () => {
  await db.batch([db.delete(ai_events), db.delete(ai_jobs), db.delete(template_exercises), db.delete(workout_templates)])
})

const template = (name: string) => db.insert(workout_templates).values({ id: crypto.randomUUID(), name, origin: 'custom' })
/** A split draft row (created an hour before `decided_at`); returns its id. */
const draft = async (name: string, status: 'pending' | 'rejected', decided_at: string) => {
  const id = crypto.randomUUID()
  await db.insert(ai_events).values({
    id,
    kind: 'proposal',
    actor: 'ai',
    summary: `Split draft "${name}"`,
    body: { kind: 'workout', mode: 'generate', date: null, workout: { name, exercises: [], rationale: '' }, muscle_scores: {} },
    proposal_status: status,
    created_at: hoursFrom(decided_at, -1),
    updated_at: decided_at,
  })
  return id
}
/** A fake router answering four upper-body picks of 4 sets (16 sets). */
const upperLlm = (onPrompt: (prompt: string) => void = () => undefined): Pick<LlmRouter, 'complete'> => ({
  complete: async (req) => {
    onPrompt(req.messages.map((m) => m.content).join('\n'))
    const pick = (exercise_id: string) => ({ exercise_id, sets: 4, rep_min: 8, rep_max: 12, load_kg: null, rest_sec: 90 })
    const data = { exercises: ['dumbbell-shoulder-press', 'seated-cable-rows', 'barbell-bench-press', 'wide-grip-lat-pulldown'].map(pick), rationale: 'Upper B.' }
    return { data: data as never, provider: 'fake', model: 'fake', latency_ms: 1, tokens_in: 1, tokens_out: 1, attempts: 1 }
  },
})
const UPPER_B: SplitSlot = { weekday: 'wed', name: 'Upper B', focus: 'upper' }
const job = async (id: string) => (await db.select().from(ai_jobs).where(eq(ai_jobs.id, id)))[0]

describe('ensureSplitDrafts', () => {
  it('no templates: queues Upper A at background priority; a second call queues nothing while it waits', async () => {
    const first = await ensureSplitDrafts(at(NOW))

    expect(first).toMatchObject({ slot: 'Upper A', reason: 'queued' })
    expect(await job(first.job_id!)).toMatchObject({ type: 'workout_template', status: 'queued', priority: 0, payload: { slot: { name: 'Upper A', focus: 'upper' } } })
    expect(await ensureSplitDrafts(at(NOW))).toEqual({ slot: null, job_id: null, reason: 'a split draft is being written' })
  })

  it('a template named " upper a " covers Upper A and Lower A dismissed 3 days ago waits: next is Upper B', async () => {
    await template(' upper a ')
    await draft('Lower A', 'rejected', hoursFrom(NOW, -72))

    const next = await ensureSplitDrafts(at(NOW))

    expect(next).toMatchObject({ slot: 'Upper B', reason: 'queued' })
    expect(await job(next.job_id!)).toMatchObject({ payload: { slot: { weekday: 'wed', name: 'Upper B', focus: 'upper' } } })
  })

  it('waits 24 h after a failed draft: nothing 2 h after it, Upper A 25 h after it', async () => {
    const failed_at = hoursFrom(NOW, -2)
    await db.insert(ai_jobs).values({
      type: 'workout_template',
      status: 'failed',
      payload: { slot: UPPER_A },
      attempts: 1,
      error: 'no AI provider is set up (no API key)',
      run_after: failed_at,
      created_at: failed_at,
      updated_at: failed_at,
    })

    expect(await ensureSplitDrafts(at(NOW))).toEqual({ slot: null, job_id: null, reason: 'waiting after a failed draft' })
    const later = await ensureSplitDrafts(at(hoursFrom(failed_at, 25)))
    expect(later).toMatchObject({ slot: 'Upper A', reason: 'queued' })
    expect(later.job_id).not.toBeNull()
  })
})

describe('split drafts in the workout jobs', () => {
  it('drafts Upper B as a template: no date, its name, and it varies from Upper A', async () => {
    const set = (e: Ex, sets: number) => ({ exercise_id: e.id, sets, rep_min: 8, rep_max: 12, target_load_kg: null, rest_sec: 90, note: null })
    await createTemplate(at(NOW, 'user'), { id: crypto.randomUUID(), name: 'Upper A', origin: 'custom', exercises: [set(bench, 6), set(pulldown, 6)] })
    let prompt = ''
    const out = await draftWorkout(at(NOW), upperLlm((p) => (prompt = p)), { mode: 'generate', slot: UPPER_B, priority: 'background' })

    expect(prompt).toContain('Template: "Upper B"')
    expect(prompt).toContain('Already in Upper A: barbell-bench-press, wide-grip-lat-pulldown')
    expect(prompt).not.toContain('Readiness:')
    expect(prompt).toContain('Total working sets: aim 16-22, allowed 12-28.')
    expect(out.name).toBe('Upper B')
    const [event] = await db.select().from(ai_events).where(eq(ai_events.id, out.proposal_id!))
    expect(event).toMatchObject({ kind: 'proposal', proposal_status: 'pending' })
    expect(event!.body).toMatchObject({ kind: 'workout', mode: 'generate', date: null, workout: { name: 'Upper B' } })
  })

  it('an Upper B draft ignored 29 days is drafted afresh, and the new draft rejects it: one pending draft per day', async () => {
    await template('Upper A')
    await template('Lower A')
    const ignored = await draft(' upper b ', 'pending', hoursFrom(NOW, -29 * 24))
    const lowerB = await draft('Lower B', 'pending', hoursFrom(NOW, -24))

    expect(await ensureSplitDrafts(at(NOW))).toMatchObject({ slot: 'Upper B', reason: 'queued' })
    const out = await draftWorkout(at(NOW), upperLlm(), { mode: 'generate', slot: UPPER_B, priority: 'background' })

    const status = async (id: string) => (await db.select().from(ai_events).where(eq(ai_events.id, id)))[0]
    expect(await status(ignored)).toMatchObject({ proposal_status: 'rejected', updated_at: NOW, read_at: NOW })
    expect(await status(out.proposal_id!)).toMatchObject({ proposal_status: 'pending' })
    expect(await status(lowerB)).toMatchObject({ proposal_status: 'pending' }) // another split day: untouched
  })

  it("planNextTrainingDay leaves Monday 2026-10-12 to its Upper A template", async () => {
    await template('Upper A')

    expect(await planNextTrainingDay(at('2026-10-12T07:00:00.000Z'), '2026-10-12')).toEqual({
      date: '2026-10-12',
      job_id: null,
      reason: "today's split template is ready",
    })
  })
})
