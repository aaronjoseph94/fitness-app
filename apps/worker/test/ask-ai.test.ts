// Owns: tests at the Ask AI seam (modules/ask-ai chatTurn / chatHistory / selectTools) with a fake LLM router — a turn
// that calls get_today then replies stores user, tool and assistant rows and returns the call; "Raise water to 3.5 L"
// leaves a pending plan-change proposal (the water target unchanged); a router failure is a calm stored reply; a
// replayed message id returns the stored turn without a second run; intent picks the tools. Rails from SPEC §2.
import { ReminderKind, type ReminderPrefs } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { chat_messages, createDb, plan_versions, profile, settings } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { chatHistory, chatTurn, MAX_TOOLS, selectTools } from '../src/modules/ask-ai'
import { ProvidersExhaustedError, type ChatRequest, type ChatResult, type LlmRouter, type ToolCall } from '../src/modules/llm'
import { getActivePlan } from '../src/modules/plan'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
/** Monday 2026-10-05 09:00 in Edmonton. */
const NOW = '2026-10-05T15:00:00.000Z'
const deps: Deps = {
  db,
  env,
  now: () => new Date(NOW),
  actor: 'user',
  waitUntil: (p) => void pending.push(p.catch(() => undefined)),
}
afterEach(async () => {
  await Promise.all(pending.splice(0))
})

const reminders = Object.fromEntries(ReminderKind.options.map((k) => [k, { enabled: true, time: null }])) as ReminderPrefs

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
      targets: {
        defaults: { kcal: 1400, protein_g: 130, carbs_g: 118.75, fat_g: 45, fibre_g: 30, water_ml: 3000, steps: 8000 },
        overrides: {},
      },
      forecast: { finish_date: '2027-06-17', weekly_rate_kg: 1.046, band: { low: 0.837, high: 1.256 }, tdee_est: 2551 },
    }),
  ])
})

type Step = { calls: ToolCall[] } | { reply: string } | { fail: true }

/** A router that plays a script: each chat() takes the next step and records the request it was given. */
function fakeRouter(steps: Step[]): LlmRouter & { requests: ChatRequest<unknown>[] } {
  const requests: ChatRequest<unknown>[] = []
  const meta = { provider: 'fake', model: 'fake-1', latency_ms: 1, tokens_in: 1, tokens_out: 1, attempts: 1 }
  return {
    requests,
    chat: async <T,>(req: ChatRequest<T>): Promise<ChatResult<T>> => {
      requests.push(req as ChatRequest<unknown>)
      const step = steps.shift()
      if (!step || 'fail' in step) throw new ProvidersExhaustedError([{ provider: 'fake', model: 'fake-1', reason: 'quota' }])
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

describe('Ask AI', () => {
  it('a turn that calls get_today then replies stores 3 messages and returns the tool call', async () => {
    const llm = fakeRouter([
      { calls: [{ id: 'c1', name: 'get_today', args: {} }] },
      { reply: 'You have 1,400 kcal left today.' },
    ])
    const input = send('Aaron here: how much can I still eat today?')
    const out = await chatTurn(deps, llm, input)

    expect(out.error).toBeNull()
    expect(out.reply).toMatchObject({ role: 'assistant', content: 'You have 1,400 kcal left today.' })
    expect(out.reply.tool_calls).toEqual([{ id: 'c1', name: 'get_today', args: {}, ok: true }])
    expect(out.tool_messages).toHaveLength(1)
    expect(JSON.parse(out.tool_messages[0]!.content)).toMatchObject({ date: '2026-10-05' })

    const stored = await chatHistory(deps, { thread_id: input.thread_id })
    expect(stored.map((m) => m.role)).toEqual(['user', 'tool', 'assistant'])
    // The model never sees the name; the second call carries the tool result.
    expect(JSON.stringify(llm.requests)).not.toMatch(/aaron/i)
    expect(llm.requests[1]!.messages.at(-1)).toMatchObject({ role: 'tool', toolCallId: 'c1', name: 'get_today' })
    expect(llm.requests[0]!.tools!.map((t) => t.name)).toContain('get_today')
  })

  it('"Raise water to 3.5 L" leaves a pending proposal and the water target unchanged', async () => {
    const llm = fakeRouter([
      {
        calls: [
          {
            id: 'c1',
            name: 'propose_plan_change',
            args: { changes: [{ field: 'water_ml', weekday: null, to: 3500 }], reason: 'You asked for 3.5 L of water a day' },
          },
        ],
      },
      { reply: 'I proposed 3,500 ml a day. Tap Accept below to apply it.' },
    ])
    const out = await chatTurn(deps, llm, send('Raise water to 3.5 L'))

    expect(out.reply.tool_calls).toEqual([expect.objectContaining({ name: 'propose_plan_change', ok: true })])
    expect(out.reply.proposals).toEqual([
      expect.objectContaining({
        type: 'proposal',
        status: 'pending',
        body: { kind: 'plan_change', changes: [expect.objectContaining({ field: 'water_ml', from: 3000, to: 3500 })] },
      }),
    ])
    expect((await getActivePlan(deps)).targets.defaults.water_ml).toBe(3000)
  })

  it('a router failure is a calm stored reply; replaying the message id does not run the turn again', async () => {
    const llm = fakeRouter([{ fail: true }])
    const input = send('How was my sleep this week?')
    const out = await chatTurn(deps, llm, input)
    expect(out.error).toBe('ai_unavailable')
    expect(out.reply.content).toMatch(/can't reach the AI right now/)
    expect(await db.select().from(chat_messages).where(eq(chat_messages.thread_id, input.thread_id))).toHaveLength(2)

    const again = await chatTurn(deps, fakeRouter([]), input)
    expect(again.reply.id).toBe(out.reply.id)
    expect(again.error).toBe('ai_unavailable')
  })

  it('picks tools by intent: core reads plus the areas asked about, never coach-only tools', () => {
    const water = selectTools(['Raise water to 3.5 L'], false).map((o) => o.tool.name)
    expect(water).toEqual(expect.arrayContaining(['get_today', 'query_metric', 'propose_plan_change', 'log_water']))
    const swap = selectTools(['Swap Thursday to a pull day'], false).map((o) => o.tool.name)
    expect(swap).toEqual(expect.arrayContaining(['get_week_plan', 'generate_workout', 'list_exercises']))
    for (const names of [water, swap, selectTools(['review my week, revert the plan and apply it'], true).map((o) => o.tool.name)]) {
      expect(names.length).toBeLessThanOrEqual(MAX_TOOLS)
      for (const coachOnly of ['apply_proposal', 'apply_review', 'restore_plan_version', 'apply_week_plan', 'set_dashboard_note', 'get_procedure'])
        expect(names).not.toContain(coachOnly)
    }
  })
})
