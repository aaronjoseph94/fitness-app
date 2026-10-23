// Owns: tests at the session routes for the logger's own writes — PATCH /api/sessions/:id saves the exercises added to a
// blank session (the plan the Worker serves back, the planned muscle scores), and a set the logger could never show as
// valid (reps over 100, a negative load) is refused at the edge instead of being stored (UX review #1 and #10).
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { createDb, equipment_profile, exercises, type NewRow } from '../src/db'

const app = createApp()
const db = createDb(env.DB)
const LOCAL = 'http://localhost'

type Ex = NewRow<typeof exercises> & { id: string }
const exercise = (slug: string, name: string, primary: Ex['primary_muscles']): Ex => ({
  id: crypto.randomUUID(),
  slug,
  name,
  category: 'strength',
  equipment: 'machine',
  mechanic: 'compound',
  level: 'beginner',
  primary_muscles: primary,
  secondary_muscles: [],
  instructions: [],
  image_paths: [],
  source: 'free-exercise-db',
})
const legPress = exercise('plan-leg-press', 'Leg Press', ['quadriceps'])
const chestPress = exercise('plan-chest-press', 'Machine Chest Press', ['chest'])

const send = (method: string, path: string, body?: unknown) =>
  app.request(
    `${LOCAL}${path}`,
    {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    },
    env,
  )

async function blankSession(): Promise<string> {
  await db.insert(exercises).values(legPress).onConflictDoNothing()
  await db.insert(exercises).values(chestPress).onConflictDoNothing()
  await db
    .insert(equipment_profile)
    .values({ equipment: 'machine', kind: 'library', status: 'have' })
    .onConflictDoNothing()
  const id = crypto.randomUUID()
  const res = await send('POST', '/api/sessions', {
    id,
    template_id: null,
    origin: 'blank',
    started_at: '2026-10-22T23:00:00.000Z',
  })
  expect(res.status).toBe(201)
  return id
}

const planned = (exercise_id: string) => ({
  exercise_id,
  sets: 3,
  rep_min: 8,
  rep_max: 12,
  target_load_kg: null,
  rest_sec: 90,
  note: null,
})

describe('PATCH /api/sessions/:id', () => {
  it('saves the exercises added to a blank session: GET serves them back as the plan, in order', async () => {
    const id = await blankSession()
    const res = await send('PATCH', `/api/sessions/${id}`, {
      exercises: [planned(chestPress.id), planned(legPress.id)],
    })
    expect(res.status).toBe(200)

    const got = (await (await send('GET', `/api/sessions/${id}`)).json()) as {
      plan: { exercise_id: string; sets: number }[]
      muscle_scores: Record<string, number> | null
    }
    expect(got.plan.map((p) => p.exercise_id)).toEqual([chestPress.id, legPress.id])
    expect(got.plan[0]?.sets).toBe(3)
    expect(got.muscle_scores).toMatchObject({ chest: 3, quadriceps: 3 })

    // Removing one later replaces the list.
    await send('PATCH', `/api/sessions/${id}`, { exercises: [planned(legPress.id)] })
    const after = (await (await send('GET', `/api/sessions/${id}`)).json()) as {
      plan: { exercise_id: string }[]
    }
    expect(after.plan.map((p) => p.exercise_id)).toEqual([legPress.id])
  })

  it('an unknown session is a 404', async () => {
    const res = await send('PATCH', `/api/sessions/${crypto.randomUUID()}`, { exercises: [] })
    expect(res.status).toBe(404)
  })
})

describe('a set the logger shows as invalid is refused', () => {
  it('500 reps or −5 kg is a 400 and nothing is stored', async () => {
    const id = await blankSession()
    const set = (over: Record<string, unknown>) => ({
      id: crypto.randomUUID(),
      exercise_id: legPress.id,
      set_index: 1,
      completed: true,
      ...over,
    })
    expect((await send('POST', `/api/sessions/${id}/sets`, set({ reps: 500, load_kg: 60 }))).status).toBe(400)
    expect((await send('POST', `/api/sessions/${id}/sets`, set({ reps: 10, load_kg: -5 }))).status).toBe(400)

    const ok = set({ reps: 10, load_kg: 60 })
    expect((await send('POST', `/api/sessions/${id}/sets`, ok)).status).toBe(201)
    expect((await send('PATCH', `/api/sets/${ok.id}`, { reps: 101 })).status).toBe(400)
    expect((await send('PATCH', `/api/sets/${ok.id}`, { load_kg: -5 })).status).toBe(400)

    const got = (await (await send('GET', `/api/sessions/${id}`)).json()) as {
      sets: { reps: number; load_kg: number }[]
    }
    expect(got.sets).toEqual([expect.objectContaining({ reps: 10, load_kg: 60 })])
  })
})
