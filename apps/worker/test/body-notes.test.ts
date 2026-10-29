// Owns: tests at the body-notes seam — a logged note is active, logging the same area and kind again renews it (one
// row, `before` = what it held), resolving hides it, and a day's AI workout draft for a knee-pain note leaves the
// quadriceps exercise out of the list the LLM sees and drops it from the reply (fake LLM router). Readiness says
// reduced volume while he has a cold. Mon 2026-10-12 noon in Edmonton.
import { DEFAULT_REMINDER_PREFS } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  body_notes,
  createDb,
  equipment_profile,
  exercises,
  plan_versions,
  settings,
  type NewRow,
} from '../src/db'
import type { Deps } from '../src/lib/deps'
import { activeBodyNotes, logBodyNote, resolveBodyNote } from '../src/modules/body-notes'
import type { LlmRouter } from '../src/modules/llm'
import { planningContext } from '../src/modules/training'
import { draftWorkout } from '../src/modules/workouts-ai'

const db = createDb(env.DB)
const deps: Deps = {
  db,
  env,
  now: () => new Date('2026-10-12T18:00:00.000Z'),
  actor: 'ai',
  waitUntil: () => undefined,
}
const DAY = '2026-10-12'

type Ex = NewRow<typeof exercises> & { id: string }
const ex = (slug: string, name: string, equipment: string, primary: Ex['primary_muscles']): Ex => ({
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
const legPress = ex('leg-press', 'Leg Press', 'machine', ['quadriceps'])
const calfRaise = ex('standing-calf-raises', 'Standing Calf Raises', 'machine', ['calves'])
const hipThrust = ex('barbell-hip-thrust', 'Barbell Hip Thrust', 'barbell', ['glutes'])

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
      reminders: DEFAULT_REMINDER_PREFS,
    }),
    db.insert(plan_versions).values({
      version: 1,
      active: true,
      created_by: 'user',
      reason: 'Baseline',
      diff: [],
      targets: {
        defaults: {
          kcal: 1400,
          protein_g: 130,
          carbs_g: 119,
          fat_g: 45,
          fibre_g: 30,
          water_ml: 3000,
          steps: 8000,
        },
        overrides: {},
      },
    }),
    ...[legPress, calfRaise, hipThrust].map((e) => db.insert(exercises).values(e)),
    db.insert(equipment_profile).values([
      { equipment: 'barbell', kind: 'library', status: 'have' },
      { equipment: 'machine', kind: 'library', status: 'have' },
    ]),
  ])
})

beforeEach(async () => {
  await db.delete(body_notes)
})

const knee = (over: Partial<Parameters<typeof logBodyNote>[1]> = {}) =>
  logBodyNote(deps, {
    id: crypto.randomUUID(),
    date: DAY,
    area: 'knee',
    kind: 'pain',
    severity: 2,
    note: "knee's sore",
    ...over,
  })

describe('body notes', () => {
  it('a logged note is active today, and a week later it is not', async () => {
    const note = await knee()

    expect(note).toMatchObject({ area: 'knee', kind: 'pain', severity: 2, actor: 'ai', before: null })
    expect((await activeBodyNotes(deps)).map((n) => n.id)).toEqual([note.id])
    expect(await activeBodyNotes(deps, '2026-10-20')).toEqual([])
  })

  it('the same area and kind again renews the active note instead of adding one', async () => {
    const first = await knee({ date: '2026-10-10' })
    const again = await knee({ severity: 3, note: 'worse today' })

    expect(again.id).toBe(first.id)
    expect(again).toMatchObject({ date: DAY, severity: 3, note: 'worse today' })
    expect(again.before).toEqual({ date: '2026-10-10', severity: 2, note: "knee's sore" })
    expect(await db.select().from(body_notes)).toHaveLength(1)
  })

  it('resolving a note hides it from the active list', async () => {
    const note = await knee()

    await resolveBodyNote(deps, note.id, { resolved_on: DAY })

    expect(await activeBodyNotes(deps)).toEqual([])
  })

  it('a cold makes readiness say reduced volume', async () => {
    await logBodyNote(deps, {
      id: crypto.randomUUID(),
      date: DAY,
      area: 'whole_body',
      kind: 'illness',
      severity: 1,
      note: 'a cold',
    })

    expect((await planningContext(deps, DAY)).readiness.reduced_volume).toBe(true)
  })

  it("a knee-pain note keeps the leg press out of a day's AI workout", async () => {
    await knee()
    let prompt = ''
    const pick = (exercise_id: string, sets: number) => ({
      exercise_id,
      sets,
      rep_min: 8,
      rep_max: 12,
      load_kg: null,
      rest_sec: 90,
    })
    const llm: Pick<LlmRouter, 'complete'> = {
      complete: async (req) => {
        prompt = req.messages.map((m) => m.content).join('\n')
        const data = {
          exercises: [pick('leg-press', 4), pick('standing-calf-raises', 6), pick('barbell-hip-thrust', 6)],
          rationale: 'Lower day.',
        }
        return {
          data: data as never,
          provider: 'fake',
          model: 'fake',
          latency_ms: 1,
          tokens_in: 1,
          tokens_out: 1,
          attempts: 1,
        }
      },
    }

    const draft = await draftWorkout(deps, llm, {
      mode: 'generate',
      date: DAY,
      note: 'legs',
      priority: 'user',
    })

    expect(prompt).toContain('Avoid loading (body notes): knee (pain, moderate).')
    expect(prompt).toContain('standing-calf-raises')
    expect(prompt).not.toContain('leg-press')
    expect(draft.exercises.map((e) => e.exercise_id)).not.toContain(legPress.id)
    expect(draft.guard_notes).toContainEqual(expect.stringContaining('Dropped Leg Press'))
  })
})
