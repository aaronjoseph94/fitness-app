// Owns: tests at the training seam for Train changes and Undo (plan 2026-10-14-ai-runs-train-three-day-week, Task 2;
// decisions 6, 7, 10): Ask AI's change waits as a pending train_change proposal and applies on Aaron's tap with its
// `before`; an MCP change applies at once and Undo puts back exactly what was there (same id), once; the 12–28 sets
// rail binds a proposed template; Keep on a split draft named like a template replaces it in place, and Undo restores it.
import { ReminderKind, type ProposalBody, type ReminderPrefs } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ai_events, createDb, exercises, plan_versions, settings, template_exercises, workout_templates, type NewRow } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { acceptProposal } from '../src/modules/plan'
import { createTemplate, getTemplate, listTemplates, revertTrainChange, trainChange } from '../src/modules/training'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
const NOW = '2026-10-14T16:00:00.000Z'
const as = (actor: Deps['actor']): Deps => ({
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
const curl = ex('dumbbell-bicep-curl', ['biceps'], 'dumbbell')

const item = (exercise_id: string, sets: number) => ({ exercise_id, sets, rep_min: 8, rep_max: 12, target_load_kg: null, rest_sec: 90, note: null })
/** Upper A as Aaron built it: three exercises, 4 sets each (12 sets). */
const UPPER_A = [item(bench.id, 4), item(pulldown.id, 4), item(press.id, 4)]

beforeAll(async () => {
  await db.batch([
    db.insert(settings).values({
      calorie_floor: 1400,
      calorie_ceiling: 1700,
      protein_min_g: 130,
      fat_min_g: 45,
      fibre_target_g: 30,
      water_target_ml: 3000,
      training_days: ['mon', 'tue', 'thu'],
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
    ...[bench, pulldown, row, press, curl].map((e) => db.insert(exercises).values(e)),
  ])
})

// The tests share one database: each starts with no templates and no events.
beforeEach(async () => {
  await db.batch([db.delete(ai_events), db.delete(template_exercises), db.delete(workout_templates)])
})

const upperA = () => createTemplate(as('user'), { id: crypto.randomUUID(), name: 'Upper A', origin: 'custom', exercises: UPPER_A })
const bodyOf = async (id: string) => (await db.select().from(ai_events).where(eq(ai_events.id, id)))[0]?.body as ProposalBody
const proposals = async () => db.select().from(ai_events).where(eq(ai_events.kind, 'proposal'))

describe('trainChange', () => {
  it('Ask AI: renaming Upper A → Push waits for a tap; accepting renames it and stores before.name "Upper A"', async () => {
    const t = await upperA()

    const proposed = await trainChange(as('ai'), { change: { op: 'template_update', template_id: t.id, name: 'Push' }, reason: 'Push day reads clearer' })

    expect(proposed).toMatchObject({ status: 'proposed', applied: null })
    expect((await getTemplate(as('user'), t.id)).name).toBe('Upper A')
    expect((await db.select().from(ai_events).where(eq(ai_events.id, proposed.proposal_id)))[0]?.summary).toBe('Rename Upper A → Push')

    await acceptProposal(as('user'), proposed.proposal_id)

    expect((await getTemplate(as('user'), t.id)).name).toBe('Push')
    const body = await bodyOf(proposed.proposal_id)
    expect(body.kind === 'train_change' && body.before && 'name' in body.before ? body.before.name : null).toBe('Upper A')
  })

  it('MCP: deleting a template applies now; Undo (Aaron) brings back the same id and exercises, once', async () => {
    const t = await upperA()

    const done = await trainChange(as('mcp'), { change: { op: 'template_delete', template_id: t.id }, reason: 'Not used any more' })

    expect(done).toMatchObject({ status: 'applied', applied: { entity: 'template', id: t.id } })
    expect(await listTemplates(as('user'))).toEqual([])
    await expect(revertTrainChange(as('ai'), done.proposal_id)).rejects.toMatchObject({ status: 403 })

    expect(await revertTrainChange(as('user'), done.proposal_id)).toEqual({ ok: true })

    const back = await getTemplate(as('user'), t.id)
    expect(back.name).toBe('Upper A')
    expect(back.exercises.map(({ id: _id, ...e }) => e)).toEqual(UPPER_A)
    await expect(revertTrainChange(as('user'), done.proposal_id)).rejects.toMatchObject({ status: 409, code: 'already_reverted' })
  })

  it('Ask AI: the reason it gives is stored on the train_change body (the card\'s "Why:" line)', async () => {
    const t = await upperA()

    const proposed = await trainChange(as('ai'), { change: { op: 'template_update', template_id: t.id, name: 'Push' }, reason: 'Push day reads clearer' })

    const body = await bodyOf(proposed.proposal_id)
    expect(body.kind === 'train_change' ? body.reason : null).toBe('Push day reads clearer')
  })

  it('Ask AI: a new template of 10 sets breaks the 12–28 sets rail (422) and stores no proposal', async () => {
    const change = { op: 'template_create' as const, name: 'Arms', exercises: [item(curl.id, 5), item(press.id, 5)] }

    await expect(trainChange(as('ai'), { change, reason: 'Arms day' })).rejects.toMatchObject({ status: 422, code: 'session_sets' })

    expect(await proposals()).toEqual([])
  })
})

describe('Keep on a split draft named like a template', () => {
  it('replaces Upper A in place (same id), keeps the old version on the proposal, and Undo puts it back', async () => {
    const t = await upperA()
    const draft = [item(bench.id, 3), item(row.id, 3), item(press.id, 3), item(curl.id, 3)]
    const draft_id = crypto.randomUUID()
    await db.insert(ai_events).values({
      id: draft_id,
      kind: 'proposal',
      actor: 'ai',
      summary: 'Split draft "Upper A"',
      body: { kind: 'workout', mode: 'generate', date: null, workout: { name: 'Upper A', exercises: draft, rationale: 'Upper A, redrafted.' }, muscle_scores: {} },
      proposal_status: 'pending',
    })

    await acceptProposal(as('user'), draft_id)

    const templates = await listTemplates(as('user'))
    expect(templates.map((x) => [x.id, x.name])).toEqual([[t.id, 'Upper A']])
    expect(templates[0]!.exercises.map(({ id: _id, ...e }) => e)).toEqual(draft)
    const body = await bodyOf(draft_id)
    expect(body.kind === 'workout' ? body.replaced?.exercises.length : null).toBe(3)

    await revertTrainChange(as('user'), draft_id)

    expect((await getTemplate(as('user'), t.id)).exercises.map(({ id: _id, ...e }) => e)).toEqual(UPPER_A)
  })

  it('Preview → Save (POST /api/templates with proposal_id) writes into Upper A (same id) instead of adding a second one', async () => {
    const t = await upperA()
    const draft_id = crypto.randomUUID()
    await db.insert(ai_events).values({
      id: draft_id,
      kind: 'proposal',
      actor: 'ai',
      summary: 'Split draft "Upper A"',
      body: { kind: 'workout', mode: 'generate', date: null, workout: { name: 'Upper A', exercises: [item(bench.id, 3), item(row.id, 3), item(press.id, 3), item(curl.id, 3)], rationale: 'Upper A, redrafted.' }, muscle_scores: {} },
      proposal_status: 'pending',
    })
    // Aaron edited the preview: one more set of rows.
    const edited = [item(bench.id, 3), item(row.id, 4), item(press.id, 3), item(curl.id, 3)]

    const saved = await createTemplate(as('user'), { id: crypto.randomUUID(), name: 'Upper A', origin: 'ai', exercises: edited, proposal_id: draft_id })

    expect(saved.id).toBe(t.id)
    const templates = await listTemplates(as('user'))
    expect(templates.map((x) => [x.id, x.name])).toEqual([[t.id, 'Upper A']])
    expect(templates[0]!.exercises.map(({ id: _id, ...e }) => e)).toEqual(edited)
    const body = await bodyOf(draft_id)
    expect(body.kind === 'workout' ? body.replaced?.exercises : null).toEqual(UPPER_A)
    expect((await db.select().from(ai_events).where(eq(ai_events.id, draft_id)))[0]?.proposal_status).toBe('accepted')

    await revertTrainChange(as('user'), draft_id)

    expect((await getTemplate(as('user'), t.id)).exercises.map(({ id: _id, ...e }) => e)).toEqual(UPPER_A)
  })
})
