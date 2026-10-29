// Owns: tests at the Ask AI seam (modules/ask-ai chatTurn / undoReceipt) for "dump or ask", with a fake LLM router whose
// extraction is scripted — the plan's example dump ("92.4 this morning, slept 6h, chicken wrap for lunch, leg press
// broken, knee's sore, doctor says aim for 88 by March") logs the weight, sleep and meal (analysing) with receipts, files
// the knee as a body note, leaves the leg press as a pending Train change and 88 kg as a pending goal change, and stores
// how the forecast moved; a hypothetical writes nothing; undoing a weigh-in brings the day's earlier value back, once.
import { env } from 'cloudflare:workers'
import { ReminderKind, type DumpExtraction, type ReminderPrefs } from '@fitness/shared/schemas'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  body_notes,
  chat_receipts,
  createDb,
  meals,
  plan_versions,
  profile,
  settings,
  sleep_logs,
  weight_logs,
} from '../src/db'
import type { Deps } from '../src/lib/deps'
import { chatHistory, chatTurn, undoReceipt } from '../src/modules/ask-ai'
import type { ChatRequest, ChatResult, CompleteRequest, CompleteResult, LlmRouter } from '../src/modules/llm'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
/** Thursday 2026-10-29 09:00 in Edmonton (MDT). */
const NOW = '2026-10-29T15:00:00.000Z'
const TODAY = '2026-10-29'
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

const reminders = Object.fromEntries(
  ReminderKind.options.map((k) => [k, { enabled: true, time: null }]),
) as ReminderPrefs

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
      training_days: ['mon', 'tue', 'thu'],
      reminders,
    }),
    db.insert(plan_versions).values({
      version: 1,
      active: true,
      created_by: 'user',
      reason: 'Baseline rails from doctor and dietitian',
      diff: [],
      targets: {
        defaults: {
          kcal: 1400,
          protein_g: 130,
          carbs_g: 118.75,
          fat_g: 45,
          fibre_g: 30,
          water_ml: 3000,
          steps: 8000,
        },
        overrides: {},
      },
      forecast: {
        finish_date: '2027-06-17',
        weekly_rate_kg: 1.046,
        band: { low: 0.837, high: 1.256 },
        tdee_est: 2551,
      },
    }),
    db.insert(weight_logs).values([
      { id: crypto.randomUUID(), date: '2026-09-26', weight_kg: 95.1, actor: 'user' },
      { id: crypto.randomUUID(), date: '2026-10-15', weight_kg: 93.6, actor: 'user' },
    ]),
  ])
})

/** A router whose extraction (complete) and coach replies (chat) are scripted; it records what it was sent. */
function fakeRouter(extraction: DumpExtraction, reply: string) {
  const completes: CompleteRequest<unknown>[] = []
  const chats: ChatRequest<unknown>[] = []
  const meta = { provider: 'fake', model: 'fake-1', latency_ms: 1, tokens_in: 1, tokens_out: 1, attempts: 1 }
  const llm: LlmRouter = {
    complete: async <T>(req: CompleteRequest<T>): Promise<CompleteResult<T>> => {
      completes.push(req as CompleteRequest<unknown>)
      return { data: req.schema.parse(extraction), ...meta }
    },
    chat: async <T>(req: ChatRequest<T>): Promise<ChatResult<T>> => {
      chats.push(req as ChatRequest<unknown>)
      return { type: 'reply', data: reply as T, message: { role: 'assistant', content: reply }, ...meta }
    },
  }
  return { llm, completes, chats }
}

const send = (content: string) => ({ id: crypto.randomUUID(), thread_id: crypto.randomUUID(), content })
const empty: DumpExtraction = { facts: [], goal: null, requests: [], questions: [] }

describe('Ask AI: dump or ask', () => {
  it('the example dump logs weight, sleep, meal and the knee with receipts; leg press and goal wait; forecast moves', async () => {
    const { llm, completes, chats } = fakeRouter(
      {
        facts: [
          { kind: 'weight', days_ago: 0, weight_kg: 92.4 },
          { kind: 'sleep', days_ago: 0, asleep_min: 360 },
          { kind: 'meal', days_ago: 0, slot: 'lunch', text: 'chicken wrap' },
          {
            kind: 'equipment',
            equipment: 'Leg press',
            status: 'dont_have',
            reason: 'The leg press is broken',
          },
          {
            kind: 'body_note',
            days_ago: 0,
            area: 'knee',
            note_kind: 'soreness',
            severity: 2,
            note: "knee's sore",
          },
        ],
        goal: {
          goal_weight_kg: 88,
          goal_date: '2027-03-31',
          reason: 'Your doctor says aim for 88 kg by March',
        },
        requests: [],
        questions: [],
      },
      'Logged. Your forecast moved a little.',
    )
    const input = send(
      "Aaron: 92.4 this morning, slept 6h, chicken wrap for lunch, leg press broken, knee's sore, doctor says aim for 88 by March",
    )
    const out = await chatTurn(deps, llm, input)

    expect(out.error).toBeNull()
    expect(completes).toHaveLength(1)
    expect(JSON.stringify(completes)).not.toMatch(/aaron/i)
    expect(out.reply.receipts.map((r) => [r.kind, r.date])).toEqual([
      ['weight', TODAY],
      ['sleep', TODAY],
      ['meal', TODAY],
      ['body_note', TODAY],
    ])
    expect(out.reply.receipts[0]!.summary).toBe('Weight 92.4 kg · Thu Oct 29')
    expect(out.reply.receipts[1]!.summary).toBe('Slept 6 h 0 min · Thu Oct 29')
    expect(out.reply.receipts[2]!.summary).toBe('Lunch: chicken wrap · analysing')

    expect((await db.select().from(weight_logs).where(eq(weight_logs.date, TODAY)))[0]).toMatchObject({
      weight_kg: 92.4,
      actor: 'ai',
    })
    expect((await db.select().from(sleep_logs).where(eq(sleep_logs.date, TODAY)))[0]).toMatchObject({
      asleep_min: 360,
    })
    const [meal] = await db.select().from(meals).where(eq(meals.id, out.reply.receipts[2]!.ref_id))
    expect(meal).toMatchObject({ slot: 'lunch', raw_text: 'chicken wrap', input_method: 'text' }) // the analysis job takes it from 'parsing'
    expect(
      await db.select().from(body_notes).where(eq(body_notes.id, out.reply.receipts[3]!.ref_id)),
    ).toEqual([expect.objectContaining({ area: 'knee', kind: 'soreness', severity: 2 })])

    // Leg press and the goal are proposals waiting for a tap, not receipts.
    expect(out.reply.proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'proposal',
          status: 'pending',
          body: expect.objectContaining({ kind: 'train_change' }),
        }),
        expect.objectContaining({
          type: 'proposal',
          status: 'pending',
          body: expect.objectContaining({ kind: 'goal_change', goal_weight_kg: 88, goal_date: '2027-03-31' }),
        }),
      ]),
    )

    // The forecast was recomputed from the new weigh-in; the coach pass read what was logged.
    expect(out.reply.forecast?.before).toMatchObject({ finish_date: '2027-06-17', tdee_est: 2551 })
    expect(out.reply.forecast?.after).toBeTruthy()
    expect(chats[0]!.system).toMatch(/Weight 92\.4 kg/)
    expect(chats[0]!.tools!.map((t) => t.name)).not.toContain('log_weight')

    // History reads the receipts and the forecast back.
    const reply = (await chatHistory(deps, { thread_id: input.thread_id })).find(
      (m) => m.role === 'assistant',
    )!
    expect(reply.receipts).toHaveLength(4)
    expect(reply.forecast).toEqual(out.reply.forecast)
  })

  it('a hypothetical ("what if I ate 2000 kcal?") writes nothing', async () => {
    const before = await db.select().from(chat_receipts)
    const meals0 = await db.select().from(meals)
    const { llm } = fakeRouter(
      { ...empty, questions: ['What if I ate 2000 kcal?'] },
      'At 2,000 kcal you would lose more slowly.',
    )
    const out = await chatTurn(deps, llm, send('What if I ate 2000 kcal today?'))
    expect(out.reply.receipts).toEqual([])
    expect(out.reply.forecast).toBeNull()
    expect(await db.select().from(chat_receipts)).toHaveLength(before.length)
    expect(await db.select().from(meals)).toHaveLength(meals0.length)
  })

  it('undo of a weight receipt brings the earlier weigh-in back; a second undo is 409', async () => {
    const earlier = crypto.randomUUID()
    await db.insert(weight_logs).values({ id: earlier, date: '2026-10-27', weight_kg: 93.1, actor: 'user' })
    const { llm } = fakeRouter(
      { ...empty, facts: [{ kind: 'weight', days_ago: 2, weight_kg: 92.8 }] },
      'Logged 92.8 kg for Tuesday.',
    )
    const out = await chatTurn(deps, llm, send('92.8 on Tuesday'))
    const [receipt] = out.reply.receipts
    expect(receipt).toMatchObject({
      kind: 'weight',
      date: '2026-10-27',
      summary: 'Weight 92.8 kg · Tue Oct 27',
    })
    expect(
      (await db.select().from(weight_logs).where(eq(weight_logs.date, '2026-10-27')))[0]!.weight_kg,
    ).toBe(92.8)

    const undone = await undoReceipt(deps, receipt!.id)
    expect(undone.undone_at).toBe(NOW)
    expect(await db.select().from(weight_logs).where(eq(weight_logs.date, '2026-10-27'))).toEqual([
      expect.objectContaining({ id: earlier, weight_kg: 93.1 }),
    ])
    await expect(undoReceipt(deps, receipt!.id)).rejects.toMatchObject({
      status: 409,
      code: 'already_undone',
    })
  })
})
