// Owns: tests at the training and workouts-ai seams for the rails on Aaron's own writes and the findings of the
// 2026-10-05 training test pass — templates and explicit session lists hold only the allowed exercise set, a template
// holds 12–28 sets (CLAUDE.md rails), a session started from a template leaves out exercises excluded since, un-hiding
// by exercise id, the progression default after two sessions on one day, recovery notes once per muscle and day, an
// AI workout Aaron asked for failing at once when no LLM provider is set up, and deleting or editing a session.
import { ReminderKind, type ReminderPrefs } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ai_events, createDb, equipment_profile, exercise_exclusions, exercises, plan_versions, session_sets, settings, workout_sessions, type NewRow } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { HttpError } from '../src/lib/http-error'
import { enqueue, runJob } from '../src/modules/jobs'
import {
  createExclusion,
  createTemplate,
  deleteExclusion,
  deleteSession,
  exerciseHistory,
  finishSession,
  getExercise,
  getSession,
  logSet,
  startSession,
  updateSet,
  updateTemplate,
} from '../src/modules/training'
import { BACKGROUND_PRIORITY, USER_PRIORITY } from '../src/modules/workouts-ai'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
const at = (iso: string, actor: Deps['actor'] = 'user'): Deps => ({
  db,
  env,
  now: () => new Date(iso),
  actor,
  waitUntil: (p) => void pending.push(p.catch(() => undefined)),
})
afterEach(async () => {
  await Promise.all(pending.splice(0))
})

type Ex = NewRow<typeof exercises>
const ex = (slug: string, name: string, equipment: string, primary: Ex['primary_muscles']): Ex & { id: string } => ({
  id: crypto.randomUUID(),
  slug,
  name,
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

const bench = ex('barbell-bench-press', 'Barbell Bench Press', 'barbell', ['chest'])
const row = ex('seated-cable-rows', 'Seated Cable Rows', 'cable', ['middle back'])
const press = ex('dumbbell-shoulder-press', 'Dumbbell Shoulder Press', 'dumbbell', ['shoulders'])
const curl = ex('dumbbell-bicep-curl', 'Dumbbell Bicep Curl', 'dumbbell', ['biceps'])
const swing = ex('one-arm-kettlebell-swings', 'One-Arm Kettlebell Swings', 'kettlebells', ['hamstrings'])
const pushup = ex('pushups', 'Pushups', 'body only', ['chest'])
const library = [bench, row, press, curl, swing, pushup]

const reminders = Object.fromEntries(ReminderKind.options.map((k) => [k, { enabled: true, time: null }])) as ReminderPrefs

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
      targets: { defaults: { kcal: 1400, protein_g: 130, carbs_g: 118.75, fat_g: 45, fibre_g: 30, water_ml: 3000, steps: 8000 }, overrides: {} },
    }),
    ...library.map((e) => db.insert(exercises).values(e)), // one row per statement: ≤ 100 bound parameters
    db.insert(equipment_profile).values([
      { equipment: 'barbell', kind: 'library', status: 'have' },
      { equipment: 'kettlebells', kind: 'library', status: 'have' },
    ]),
  ])
})

/** `sets` spread over the four allowed upper-body exercises (at most 10 per exercise, as the schema allows). */
const upper = (sets: number) =>
  [bench, row, press, curl].flatMap((e, i) => {
    const n = Math.floor(sets / 4) + (i < sets % 4 ? 1 : 0)
    return n ? [{ exercise_id: e.id, sets: n, rep_min: 8, rep_max: 12, target_load_kg: null, rest_sec: 90, note: null }] : []
  })

const rejection = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  )
  return e instanceof HttpError ? { status: e.status, code: e.code } : e
}

describe("rails on Aaron's own templates and sessions", () => {
  it('a template holds 12–28 sets: 11 and 29 are refused, 12 and 28 are kept', async () => {
    const deps = at('2026-10-05T15:00:00.000Z')
    const make = (sets: number) => createTemplate(deps, { id: crypto.randomUUID(), name: `T${sets}`, origin: 'custom', exercises: upper(sets) })
    expect(await rejection(make(11))).toEqual({ status: 422, code: 'session_sets' })
    expect(await rejection(make(29))).toEqual({ status: 422, code: 'session_sets' })
    expect((await make(12)).exercises.reduce((n, e) => n + e.sets, 0)).toBe(12)
    expect((await make(28)).exercises.reduce((n, e) => n + e.sets, 0)).toBe(28)
  })

  it('a template never holds an exercise outside the allowed set; a session plan leaves it out (a log is never refused)', async () => {
    const deps = at('2026-10-05T15:00:00.000Z')
    const withPushups = [...upper(12), { exercise_id: pushup.id, sets: 3, rep_min: 8, rep_max: 12, target_load_kg: null, rest_sec: 90, note: null }]
    expect(await rejection(createTemplate(deps, { id: crypto.randomUUID(), name: 'Pushups', origin: 'custom', exercises: withPushups }))).toMatchObject({
      status: 422,
      code: 'excluded_category',
    })
    const session = await startSession(deps, { id: crypto.randomUUID(), template_id: null, origin: 'blank', started_at: '2026-10-05T15:00:00.000Z', exercises: withPushups })
    expect(session.plan?.map((p) => p.exercise_id)).not.toContain(pushup.id)
    expect(session.recovery?.notes).toContainEqual(expect.stringMatching(/^Left out Pushups: /))
  })

  it('a session started from a template leaves out an exercise excluded since the template was saved, and says so', async () => {
    const deps = at('2026-10-06T15:00:00.000Z')
    const list = [...upper(12), { exercise_id: swing.id, sets: 3, rep_min: 10, rep_max: 15, target_load_kg: 16, rest_sec: 60, note: null }]
    const template = await createTemplate(deps, { id: crypto.randomUUID(), name: 'With swings', origin: 'custom', exercises: list })
    await db.update(equipment_profile).set({ status: 'dont_have' }).where(eq(equipment_profile.equipment, 'kettlebells'))

    const session = await startSession(deps, { id: crypto.randomUUID(), template_id: template.id, origin: 'template', started_at: '2026-10-06T15:00:00.000Z' })
    expect(session.plan?.map((p) => p.exercise_id)).not.toContain(swing.id)
    expect(session.plan).toHaveLength(4)
    expect(session.recovery?.notes).toContainEqual(expect.stringContaining('One-Arm Kettlebell Swings'))

    // Renaming the template keeps its list as it is (no rail check on a list the patch does not replace).
    expect((await updateTemplate(deps, template.id, { name: 'Renamed' })).name).toBe('Renamed')
    await db.update(equipment_profile).set({ status: 'have' }).where(eq(equipment_profile.equipment, 'kettlebells'))
  })
})

describe('un-hiding', () => {
  it("DELETE /api/exclusions/:id also takes the exercise's id (the detail sheet has no exclusion id)", async () => {
    const deps = at('2026-10-05T15:00:00.000Z')
    await createExclusion(deps, { id: crypto.randomUUID(), exercise_id: curl.id, reason: 'Left elbow' })
    expect((await getExercise(deps, curl.id)).allowed).toBe(false)
    await deleteExclusion(deps, curl.id)
    expect((await getExercise(deps, curl.id)).allowed).toBe(true)
    // The body-only rail is no exclusion row: nothing un-hides it.
    await deleteExclusion(deps, pushup.id)
    expect((await getExercise(deps, pushup.id)).allowed).toBe(false)
    expect(await db.select().from(exercise_exclusions)).toHaveLength(1)
  })
})

describe('progression after two sessions on one day', () => {
  it("holds at the later session's load, not the earlier one's", async () => {
    const plan = [{ exercise_id: press.id, sets: 3, rep_min: 8, rep_max: 12, target_load_kg: null, rest_sec: 90, note: null }]
    const session = async (started_at: string, load_kg: number) => {
      const deps = at(started_at)
      const s = await startSession(deps, { id: crypto.randomUUID(), template_id: null, origin: 'blank', started_at, exercises: plan })
      for (const set_index of [1, 2, 3]) await logSet(deps, s.id, { id: crypto.randomUUID(), exercise_id: press.id, set_index, reps: 10, load_kg, completed: true })
      await finishSession(deps, s.id, { ended_at: new Date(Date.parse(started_at) + 45 * 60_000).toISOString() })
    }
    await session('2026-11-02T15:00:00.000Z', 20) // Mon 08:00 Edmonton
    await session('2026-11-02T23:30:00.000Z', 25) // Mon 16:30 Edmonton, same local date
    const history = await exerciseHistory(at('2026-11-03T15:00:00.000Z'), press.id)
    expect(history.next).toMatchObject({ kind: 'hold', load_kg: 25 })
  })
})

describe('recovery notes', () => {
  it('say a muscle trained the day before once, however many sessions that day had', async () => {
    const plan = [{ exercise_id: row.id, sets: 4, rep_min: 8, rep_max: 12, target_load_kg: null, rest_sec: 90, note: null }]
    for (const started_at of ['2026-11-09T15:00:00.000Z', '2026-11-09T23:00:00.000Z']) // Mon 2026-11-09, twice
      await startSession(at(started_at), { id: crypto.randomUUID(), template_id: null, origin: 'blank', started_at, exercises: plan })
    const tue = '2026-11-10T23:00:00.000Z'
    const session = await startSession(at(tue), { id: crypto.randomUUID(), template_id: null, origin: 'blank', started_at: tue, exercises: plan })
    expect(session.recovery?.conflicts).toEqual(['middle back'])
    expect(session.recovery?.notes).toEqual(['middle back is also a primary target the day before'])
  })
})

describe('deleting a session', () => {
  it('removes its sets, its finish note and the session in one go; a replay is a no-op', async () => {
    const plan = [{ exercise_id: bench.id, sets: 3, rep_min: 8, rep_max: 12, target_load_kg: null, rest_sec: 90, note: null }]
    const run = async (started_at: string) => {
      const deps = at(started_at)
      const s = await startSession(deps, { id: crypto.randomUUID(), template_id: null, origin: 'blank', started_at, exercises: plan })
      for (const set_index of [1, 2]) await logSet(deps, s.id, { id: crypto.randomUUID(), exercise_id: bench.id, set_index, reps: 10, load_kg: 40, completed: true })
      await finishSession(deps, s.id, { ended_at: new Date(Date.parse(started_at) + 40 * 60_000).toISOString() })
      return s.id
    }
    const keep = await run('2026-11-16T23:00:00.000Z')
    const gone = await run('2026-11-17T23:00:00.000Z')
    const rows = async (id: string) => ({
      session: (await db.select().from(workout_sessions).where(eq(workout_sessions.id, id))).length,
      sets: (await db.select().from(session_sets).where(eq(session_sets.session_id, id))).length,
      note: (await db.select().from(ai_events).where(eq(ai_events.id, id))).length,
    })
    expect(await rows(gone)).toEqual({ session: 1, sets: 2, note: 1 })

    const deps = at('2026-11-18T15:00:00.000Z')
    expect(await deleteSession(deps, gone)).toEqual({ ok: true })
    expect(await rows(gone)).toEqual({ session: 0, sets: 0, note: 0 })
    expect(await rows(keep)).toEqual({ session: 1, sets: 2, note: 1 })
    // A queued delete replayed (or an unknown id) answers 200 like the other deletes, so the offline queue moves on.
    expect(await deleteSession(deps, gone)).toEqual({ ok: true })
    // The deleted session no longer counts: the next one's "last" sets come from the session kept.
    const next = await startSession(deps, { id: crypto.randomUUID(), template_id: null, origin: 'blank', started_at: '2026-11-18T15:00:00.000Z', exercises: plan })
    expect(next.plan?.[0]?.last?.session_id).toBe(keep)
  })
})

describe('editing a finished session', () => {
  it('re-finishing with the same end time recomputes the summary and rewrites the finish note', async () => {
    const plan = [{ exercise_id: curl.id, sets: 2, rep_min: 8, rep_max: 12, target_load_kg: null, rest_sec: 90, note: null }]
    const started_at = '2026-11-23T23:00:00.000Z'
    const ended_at = '2026-11-23T23:50:00.000Z'
    const deps = at(started_at)
    const s = await startSession(deps, { id: crypto.randomUUID(), template_id: null, origin: 'blank', started_at, exercises: plan })
    const ids = [crypto.randomUUID(), crypto.randomUUID()]
    for (const [i, id] of ids.entries()) await logSet(deps, s.id, { id, exercise_id: curl.id, set_index: i + 1, reps: 10, load_kg: 12, completed: true })
    const first = await finishSession(deps, s.id, { ended_at })
    expect(first.summary.total_volume_kg).toBe(240) // 2 × 10 × 12

    // A typo fixed the next day: the second set was 14 kg.
    const later = at('2026-11-24T15:00:00.000Z')
    await updateSet(later, ids[1]!, { load_kg: 14 })
    const again = await finishSession(later, s.id, { ended_at })
    expect(again.summary.total_volume_kg).toBe(260) // 10 × 12 + 10 × 14
    expect(again.summary.duration_min).toBe(50)
    expect((await getSession(later, s.id)).ended_at).toBe(ended_at)
    const [note] = await db.select().from(ai_events).where(eq(ai_events.id, s.id))
    expect(note!.summary).toBe('Session finished: 50 min, 260 kg volume')
    expect(note!.updated_at).toBe('2026-11-24T15:00:00.000Z')
  })
})

describe('AI workout with no LLM provider set up', () => {
  it("fails Aaron's request at once instead of leaving him at a spinner for minutes", async () => {
    const deps = at('2026-10-05T18:00:00.000Z')
    const job = await enqueue(deps, { type: 'workout_generate', payload: { date: '2026-10-05', focus: 'Upper body' }, priority: USER_PRIORITY })
    const outcome = await runJob(deps, job.id)
    expect(outcome.status).toBe('failed')
    expect(outcome.error).toMatch(/no AI provider/i)
  })

  it('fails a nightly draft at once too when no provider has a key (retrying cannot help)', async () => {
    const deps = at('2026-10-05T18:00:00.000Z', 'ai')
    const job = await enqueue(deps, { type: 'workout_generate', payload: { date: '2026-10-05', focus: null }, priority: BACKGROUND_PRIORITY })
    expect((await runJob(deps, job.id)).status).toBe('failed')
  })
})
