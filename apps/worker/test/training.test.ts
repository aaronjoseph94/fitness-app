// Owns: tests at the training and workouts-ai seams — the allowed exercise set (body-only rail, exclusions, equipment
// status), finishing a session (volume and an Epley PR), an AI draft repaired by the guards (fake LLM router), and
// the nightly next-training-day hook. Rails from SPEC §2/§6; split Mon–Thu (CLAUDE.md decided defaults).
import { ReminderKind, type ReminderPrefs } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ai_events, createDb, equipment_profile, exercise_exclusions, exercises, plan_versions, settings, type NewRow } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { deleteExclusion, finishSession, listExercises, logSet, startSession } from '../src/modules/training'
import { draftWorkout, planNextTrainingDay } from '../src/modules/workouts-ai'
import type { LlmRouter } from '../src/modules/llm'

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
const ex = (slug: string, name: string, equipment: string, primary: Ex['primary_muscles'], secondary: Ex['secondary_muscles'] = []): Ex & { id: string } => ({
  id: crypto.randomUUID(),
  slug,
  name,
  category: 'strength',
  equipment,
  mechanic: 'compound',
  level: 'beginner',
  primary_muscles: primary,
  secondary_muscles: secondary,
  instructions: [],
  image_paths: [],
  source: 'free-exercise-db',
})

const bench = ex('barbell-bench-press', 'Barbell Bench Press', 'barbell', ['chest'], ['triceps', 'shoulders'])
const pulldown = ex('wide-grip-lat-pulldown', 'Wide-Grip Lat Pulldown', 'cable', ['lats'], ['biceps'])
const row = ex('seated-cable-rows', 'Seated Cable Rows', 'cable', ['middle back'], ['lats', 'biceps'])
const press = ex('dumbbell-shoulder-press', 'Dumbbell Shoulder Press', 'dumbbell', ['shoulders'], ['triceps'])
const curl = ex('dumbbell-bicep-curl', 'Dumbbell Bicep Curl', 'dumbbell', ['biceps'])
const pushdown = ex('triceps-pushdown', 'Triceps Pushdown', 'cable', ['triceps'])
const pushup = ex('pushups', 'Pushups', 'body only', ['chest'], ['triceps'])
const smith = ex('smith-machine-bench-press', 'Smith Machine Bench Press', 'machine', ['chest'], ['triceps']) // filed under the generic 'machine', as in free-exercise-db
const hidden = ex('dumbbell-flyes', 'Dumbbell Flyes', 'dumbbell', ['chest'])
const library = [bench, pulldown, row, press, curl, pushdown, pushup, smith, hidden]

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
      { equipment: 'machine', kind: 'library', status: 'have' },
      { equipment: 'smith machine', kind: 'machine', status: 'dont_have', note: null },
    ]),
    db.insert(exercise_exclusions).values({ exercise_id: hidden.id, reason: 'Hidden from its detail sheet: left shoulder' }),
  ])
})

describe('allowed exercise set', () => {
  it('leaves out body-only, hidden and dont_have-equipment exercises, and says why under scope=all', async () => {
    const deps = at('2026-10-05T15:00:00.000Z')
    const allowed = (await listExercises(deps, {})).map((e) => e.slug)
    expect(allowed).toContain('barbell-bench-press')
    expect(allowed).not.toContain('pushups')
    expect(allowed).not.toContain('dumbbell-flyes')
    expect(allowed).not.toContain('smith-machine-bench-press')

    const all = await listExercises(deps, { scope: 'all', muscle: 'chest' })
    const why = Object.fromEntries(all.map((e) => [e.slug, e.excluded_reason]))
    expect(why['barbell-bench-press']).toBeNull()
    expect(why['pushups']).toMatch(/body only/)
    expect(why['dumbbell-flyes']).toBe('Hidden from its detail sheet: left shoulder')
    expect(why['smith-machine-bench-press']).toMatch(/smith machine: don't have/)
  })

  it('un-hiding is a soft delete: re-running the seed (INSERT OR IGNORE by id) keeps the exercise allowed', async () => {
    const deps = at('2026-10-05T15:00:00.000Z')
    const seeded = { id: crypto.randomUUID(), exercise_id: curl.id, reason: 'Seeded exclusion' }
    await db.insert(exercise_exclusions).values(seeded)
    expect((await listExercises(deps, {})).map((e) => e.slug)).not.toContain('dumbbell-bicep-curl')

    await deleteExclusion(deps, seeded.id)
    await db.insert(exercise_exclusions).values(seeded).onConflictDoNothing()
    expect((await listExercises(deps, {})).map((e) => e.slug)).toContain('dumbbell-bicep-curl')
  })
})

describe('sessions', () => {
  it('finishing a session stores volume and an e1RM PR against the previous session', async () => {
    const plan = [{ exercise_id: bench.id, sets: 3, rep_min: 6, rep_max: 8, target_load_kg: 60, rest_sec: 120, note: null }]
    const logBench = async (deps: Deps, session_id: string, load_kg: number) => {
      for (const set_index of [0, 1, 2]) await logSet(deps, session_id, { id: crypto.randomUUID(), exercise_id: bench.id, set_index, reps: 8, load_kg, completed: true })
    }

    const first = at('2026-10-05T23:00:00.000Z')
    const s1 = await startSession(first, { id: crypto.randomUUID(), template_id: null, origin: 'blank', started_at: '2026-10-05T23:00:00.000Z', exercises: plan })
    await logBench(first, s1.id, 60)
    await finishSession(first, s1.id, { ended_at: '2026-10-05T23:50:00.000Z' })

    const second = at('2026-10-07T23:00:00.000Z')
    const s2 = await startSession(second, { id: crypto.randomUUID(), template_id: null, origin: 'blank', started_at: '2026-10-07T23:00:00.000Z', exercises: plan })
    expect(s2.plan?.[0]?.last?.sets).toHaveLength(3) // last session's 3 × 8 × 60 kg, greyed in
    expect(s2.plan?.[0]?.default_load_kg).toBe(60) // one session at the top of the range: hold
    await logBench(second, s2.id, 62.5)
    const { summary, session } = await finishSession(second, s2.id, { ended_at: '2026-10-07T23:45:00.000Z' })

    expect(summary.duration_min).toBe(45)
    expect(summary.total_volume_kg).toBe(1500) // 3 × 8 × 62.5
    expect(summary.volume_by_muscle).toMatchObject({ chest: 1500, triceps: 750, shoulders: 750 })
    expect(summary.muscle_scores).toMatchObject({ chest: 3, triceps: 1.5 })
    // Epley: 62.5 × (1 + 8/30) = 79.17 vs 60 × (1 + 8/30) = 76
    expect(summary.prs).toContainEqual(expect.objectContaining({ kind: 'best_e1rm', e1rm_kg: 79.17, previous_best_kg: 76 }))
    expect(session.prs).toHaveLength(summary.prs.length)
  })
})

describe('AI workouts', () => {
  it('drops an excluded pick, trims to 28 sets, scores muscles with the engine and writes a pending proposal', async () => {
    const deps = at('2026-10-11T22:00:00.000Z')
    let prompt = ''
    const llm: Pick<LlmRouter, 'complete'> = {
      complete: async (req) => {
        prompt = req.messages.map((m) => m.content).join('\n')
        const pick = (exercise_id: string, sets: number) => ({ exercise_id, sets, rep_min: 8, rep_max: 12, load_kg: null, rest_sec: 90 })
        const data = {
          exercises: [pick('barbell-bench-press', 6), pick('pushups', 4), pick('wide-grip-lat-pulldown', 6), pick('seated-cable-rows', 6), pick('dumbbell-shoulder-press', 6), pick('triceps-pushdown', 6)],
          rationale: 'Upper day: press and pull balanced.\nModerate volume in a deficit.',
        }
        return { data: data as never, provider: 'fake', model: 'fake', latency_ms: 1, tokens_in: 1, tokens_out: 1, attempts: 1 }
      },
    }

    const draft = await draftWorkout(deps, llm, { mode: 'generate', date: '2026-10-12', priority: 'user' })

    expect(prompt).not.toContain('pushups') // the AI only sees the allowed set
    expect(prompt).not.toContain('dumbbell-flyes')
    const ids = draft.exercises.map((e) => e.exercise_id)
    expect(ids).not.toContain(pushup.id)
    expect(draft.guard_notes).toContainEqual(expect.stringContaining('Dropped Pushups'))
    const total = draft.exercises.reduce((n, e) => n + e.sets, 0)
    expect(total).toBe(28) // 30 allowed sets trimmed to the 28 maximum
    expect(draft.muscle_scores?.chest).toBe(draft.exercises.find((e) => e.exercise_id === bench.id)!.sets)

    const [event] = await db.select().from(ai_events).where(eq(ai_events.id, draft.proposal_id!))
    expect(event).toMatchObject({ kind: 'proposal', actor: 'ai', proposal_status: 'pending' })
    expect(event!.body).toMatchObject({ kind: 'workout', mode: 'generate', date: '2026-10-12' })

    // Starting a session from the proposal accepts it and uses its draft as the plan.
    const session = await startSession(at('2026-10-12T23:00:00.000Z'), {
      id: crypto.randomUUID(),
      template_id: null,
      origin: 'ai',
      started_at: '2026-10-12T23:00:00.000Z',
      proposal_id: draft.proposal_id!,
    })
    expect(session.plan?.map((p) => p.exercise_id)).toEqual(ids)
    const [accepted] = await db.select().from(ai_events).where(eq(ai_events.id, draft.proposal_id!))
    expect(accepted!.proposal_status).toBe('accepted')
  })

  it('nightly hook queues today once when it is a training day with nothing planned', async () => {
    const deps = at('2026-10-15T07:00:00.000Z', 'ai') // Thu 01:00 in Edmonton
    const first = await planNextTrainingDay(deps, '2026-10-15')
    expect(first).toMatchObject({ date: '2026-10-15', reason: 'queued' })
    expect(first.job_id).not.toBeNull()
    expect(await planNextTrainingDay(deps, '2026-10-15')).toMatchObject({ job_id: null, reason: 'a workout job is already queued' })
    expect(await planNextTrainingDay(deps, '2026-10-16')).toMatchObject({ job_id: null, reason: 'not a training day' }) // Friday
  })
})
