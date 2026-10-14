// Owns: tests at the Ask AI seam (modules/ask-ai selectTools / chatTurn, fake LLM router) for Train (plan
// 2026-10-14-ai-runs-train-three-day-week, Task 7): "come up with exercises for the week" offers plan_training_week and
// get_training_week; "rename Upper A to Push" offers update_template (a proposal for a tap) and list_templates; "I
// don't have a leg press" offers update_equipment; never more than MAX_TOOLS, never revert_train_change; a turn whose
// model calls plan_training_week for Mon, Tue, Thu leaves one pending training_days proposal (settings unchanged), three
// queued workout_template jobs, and the days card under the reply; renaming a template from the chat leaves a pending
// train_change card and the template as it was. Rails from SPEC §2; split from SPEC §7 (Mon, Tue, Thu → Upper A,
// Lower A, Full body).
import { ReminderKind, type ReminderPrefs } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ai_events, ai_jobs, createDb, exercises, plan_versions, profile, settings, type NewRow } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { chatTurn, MAX_TOOLS, selectTools } from '../src/modules/ask-ai'
import { ProvidersExhaustedError, type ChatRequest, type ChatResult, type LlmRouter, type ToolCall } from '../src/modules/llm'
import { getSettings } from '../src/modules/settings'
import { createTemplate, getTemplate } from '../src/modules/training'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
/** Wednesday 2026-10-14 10:00 in Edmonton. */
const NOW = '2026-10-14T16:00:00.000Z'
/** A model key is set (Settings → AI), so planning the week may queue its drafts; the drafts never run here. */
const deps: Deps = {
  db,
  env: { ...env, GROQ_API_KEY: 'test-key' },
  now: () => new Date(NOW),
  actor: 'user',
  waitUntil: (p) => void pending.push(p.catch(() => undefined)),
  budget: { limit: 0, used: 0 },
}
afterEach(async () => {
  await Promise.all(pending.splice(0))
  vi.restoreAllMocks()
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
const press = ex('dumbbell-shoulder-press', ['shoulders'], 'dumbbell')
const item = (exercise_id: string, sets: number) => ({ exercise_id, sets, rep_min: 8, rep_max: 12, target_load_kg: null, rest_sec: 90, note: null })

beforeAll(async () => {
  await db.batch([
    db.insert(profile).values({
      height_cm: 165.1,
      sex: 'male',
      goal_weight_kg: 65,
      goal_date: '2027-08-04',
      start_weight_kg: 95.1,
      start_date: '2026-09-26',
    }),
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
    ...[bench, pulldown, press].map((e) => db.insert(exercises).values(e)),
  ])
})

type Step = { calls: ToolCall[] } | { reply: string }

/** A router that plays a script: each chat() takes the next step and records the request it was given. */
function fakeRouter(steps: Step[]): LlmRouter & { requests: ChatRequest<unknown>[] } {
  const requests: ChatRequest<unknown>[] = []
  const meta = { provider: 'fake', model: 'fake-1', latency_ms: 1, tokens_in: 1, tokens_out: 1, attempts: 1 }
  return {
    requests,
    chat: async <T,>(req: ChatRequest<T>): Promise<ChatResult<T>> => {
      requests.push(req as ChatRequest<unknown>)
      const step = steps.shift()
      if (!step) throw new ProvidersExhaustedError([{ provider: 'fake', model: 'fake-1', reason: 'quota' }])
      if ('calls' in step)
        return { type: 'tool_calls', toolCalls: step.calls, message: { role: 'assistant', content: '', toolCalls: step.calls }, ...meta }
      return { type: 'reply', data: step.reply as T, message: { role: 'assistant', content: step.reply }, ...meta }
    },
    complete: async () => {
      throw new Error('not used')
    },
  }
}

const send = (content: string) => ({ id: crypto.randomUUID(), thread_id: crypto.randomUUID(), content })
const offered = (message: string) => selectTools([message], false)
const names = (message: string) => offered(message).map((o) => o.tool.name)

describe('Ask AI runs Train', () => {
  it('offers the Train tools a question needs, each change as a proposal, within MAX_TOOLS', () => {
    expect(names('come up with exercises for the week')).toEqual(expect.arrayContaining(['plan_training_week', 'get_training_week']))
    expect(names('rename Upper A to Push')).toEqual(expect.arrayContaining(['update_template', 'list_templates']))
    expect(names("I don't have a leg press")).toContain('update_equipment')

    const access = (message: string, tool: string) => offered(message).find((o) => o.tool.name === tool)?.access
    expect(access('rename Upper A to Push', 'update_template')).toBe('propose')
    expect(access("I don't have a leg press", 'update_equipment')).toBe('propose')
    expect(access('Plan my week: Mon, Tue, Thu', 'plan_training_week')).toBe('propose')
    expect(access('Start my Upper A workout', 'start_session')).toBe('log')

    for (const message of [
      'come up with exercises for the week',
      'rename Upper A to Push',
      "I don't have a leg press",
      'Delete the Upper B template, hide kettlebell swings, and train Mon, Tue and Thu from now on',
      'undo the template change and un-hide push-ups',
    ]) {
      const tools = names(message)
      expect(tools.length, message).toBeLessThanOrEqual(MAX_TOOLS)
      expect(tools, message).not.toContain('revert_train_change')
    }
    // Un-hiding is Aaron's alone (an exercise could be bodyweight): asking for it offers no hide tool to misuse.
    expect(names('un-hide push-ups and lower my calorie floor to 1200')).not.toContain('hide_exercise')
  })

  it('"Plan my week" for Mon, Tue, Thu: one pending training_days proposal, three queued drafts, settings unchanged', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}', { status: 503 })) // no provider is reached
    const llm = fakeRouter([
      { calls: [{ id: 'c1', name: 'plan_training_week', args: { training_days: ['mon', 'tue', 'thu'] } }] },
      { reply: 'I proposed Mon, Tue and Thu; the three drafts arrive as cards in a minute or two.' },
    ])
    const out = await chatTurn(deps, llm, send('Come up with exercises for the week: Monday, Tuesday and Thursday'))

    expect(out.reply.tool_calls).toEqual([expect.objectContaining({ name: 'plan_training_week', ok: true })])
    const days = await db.select().from(ai_events).where(eq(ai_events.kind, 'proposal'))
    const proposals = days.filter((e) => (e.body as { kind?: string } | null)?.kind === 'training_days')
    expect(proposals).toHaveLength(1)
    expect(proposals[0]).toMatchObject({ proposal_status: 'pending', body: { kind: 'training_days', training_days: ['mon', 'tue', 'thu'] } })
    expect(out.reply.proposals).toEqual([expect.objectContaining({ type: 'proposal', id: proposals[0]!.id, status: 'pending' })])
    expect((await getSettings(deps)).settings.training_days).toEqual(['mon', 'tue', 'wed', 'thu'])

    const jobs = await db.select().from(ai_jobs).where(eq(ai_jobs.type, 'workout_template'))
    expect(jobs.map((j) => j.status)).toEqual(['queued', 'queued', 'queued'])
    expect(jobs.map((j) => (j.payload as { slot: { name: string } }).slot.name).sort()).toEqual(['Full body', 'Lower A', 'Upper A'])

    // What the model was told: plan the week with the days named; un-hiding and the rails stay his.
    expect(llm.requests[0]!.system).toMatch(/plan_training_week with the days he names/)
    expect(llm.requests[0]!.system).toMatch(/un-hide an exercise \(Train → Exercise library\)/)
  })

  it('renaming Upper A to Push from the chat leaves a train_change card for a tap and the template as it was', async () => {
    const upperA = await createTemplate(deps, {
      id: crypto.randomUUID(),
      name: 'Upper A',
      origin: 'custom',
      exercises: [item(bench.id, 4), item(pulldown.id, 4), item(press.id, 4)],
    })
    const llm = fakeRouter([
      { calls: [{ id: 'c1', name: 'update_template', args: { template_id: upperA.id, name: 'Push', reason: 'You asked to rename it' } }] },
      { reply: 'Tap Apply below to rename Upper A to Push.' },
    ])
    const out = await chatTurn(deps, llm, send('rename Upper A to Push'))

    expect(out.reply.tool_calls).toEqual([expect.objectContaining({ name: 'update_template', ok: true })])
    expect(out.reply.proposals).toEqual([
      expect.objectContaining({ type: 'proposal', status: 'pending', body: expect.objectContaining({ kind: 'train_change' }) }),
    ])
    expect((await getTemplate(deps, upperA.id)).name).toBe('Upper A')
  })
})
