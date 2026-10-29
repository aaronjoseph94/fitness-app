// Owns: tests at the Ask AI seam (modules/ask-ai chatTurn / undoReceipt) for "dump or ask", with a fake LLM router whose
// extraction is scripted — the plan's example dump ("92.4 this morning, slept 6h, chicken wrap for lunch, leg press
// broken, knee's sore, doctor says aim for 88 by March") logs the weight, sleep and meal (analysing) with receipts, files
// the knee as a body note, leaves the leg press as a pending Train change and 88 kg as a pending goal change, and stores
// how the forecast moved; a hypothetical writes nothing; undoing a weigh-in brings the day's earlier value back, once.
// Also: a "1,200 kcal" request never lands below the 1,400 floor; a replayed message id logs nothing twice; Undo after
// the day was logged again is 409 superseded; a screenshot's weight with no ask to log is not logged; a queued dump is
// read against when it was typed (sent_at).
import { env } from 'cloudflare:workers'
import { ReminderKind, type DumpExtraction, type ReminderPrefs } from '@fitness/shared/schemas'
import { and, eq } from 'drizzle-orm'
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
import { logWeighIn } from '../src/modules/body'
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

/**
 * A router whose extraction (complete) and coach replies (chat) are scripted; it records what it was sent. `calls`:
 * tool calls the coach makes in its first round before replying.
 */
function fakeRouter(
  extraction: unknown,
  reply: string,
  calls: { name: string; args: Record<string, unknown> }[] = [],
) {
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
      if (chats.length === 1 && calls.length) {
        const toolCalls = calls.map((c, i) => ({ id: `call_${i}`, ...c }))
        return {
          type: 'tool_calls',
          toolCalls,
          message: { role: 'assistant', content: '', toolCalls },
          ...meta,
        }
      }
      return { type: 'reply', data: reply as T, message: { role: 'assistant', content: reply }, ...meta }
    },
  }
  return { llm, completes, chats }
}

const send = (content: string) => ({ id: crypto.randomUUID(), thread_id: crypto.randomUUID(), content })
const weightOn = (date: string) => db.select().from(weight_logs).where(eq(weight_logs.date, date))
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
    // The dump's note reaches the coach as data in his turn, not in the system prompt.
    expect(chats[0]!.system).not.toMatch(/Weight 92\.4 kg/)
    expect(chats[0]!.messages.at(-1)!.content).toMatch(/^\{"data":".*Weight 92\.4 kg/)
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

  it('"drop my target to 1,200 kcal" never lands below the 1,400 floor', async () => {
    const { llm } = fakeRouter(
      { ...empty, requests: ['drop my target to 1,200 kcal'] },
      'I cannot go below your 1,400 kcal floor.',
      [
        {
          name: 'propose_plan_change',
          args: { changes: [{ field: 'kcal', weekday: null, to: 1200 }], reason: 'He asked for 1,200 kcal' },
        },
      ],
    )
    const out = await chatTurn(deps, llm, send('Drop my target to 1,200 kcal'))
    expect(out.reply.receipts).toEqual([])
    const [active] = await db.select().from(plan_versions).where(eq(plan_versions.active, true))
    expect(active!.targets.defaults.kcal).toBeGreaterThanOrEqual(1400)
    for (const p of out.reply.proposals) expect(JSON.stringify(p)).not.toMatch(/"to":1200\b/)
  })

  it('replaying a message id returns the same receipts and logs nothing twice; an unreadable fact is reported', async () => {
    const { llm, completes, chats } = fakeRouter(
      {
        ...empty,
        facts: [
          { kind: 'weight', days_ago: 5, weight_kg: 93.3 },
          { kind: 'weight', days_ago: 5, weight_kg: 'heavy' },
        ],
      },
      'Logged 93.3 kg.',
    )
    const input = send('93.3 on Saturday')
    const first = await chatTurn(deps, llm, input)
    expect(first.reply.receipts.map((r) => r.summary)).toEqual(['Weight 93.3 kg · Sat Oct 24'])
    expect(chats[0]!.messages.at(-1)!.content).toMatch(/couldn't read: weight/)
    const again = await chatTurn(deps, llm, input)
    expect(again.error).toBeNull()
    expect(again.reply.receipts.map((r) => r.id)).toEqual(first.reply.receipts.map((r) => r.id))
    expect(completes).toHaveLength(1)
    expect(await weightOn('2026-10-24')).toHaveLength(1)
  })

  it('Undo after the day was logged again is 409 superseded, and the new weigh-in stays', async () => {
    const { llm } = fakeRouter(
      { ...empty, facts: [{ kind: 'weight', days_ago: 4, weight_kg: 93.0 }] },
      'Logged.',
    )
    const out = await chatTurn(deps, llm, send('93.0 on Sunday'))
    const [receipt] = out.reply.receipts
    const again = crypto.randomUUID()
    await logWeighIn(deps, { id: again, date: '2026-10-25', weight_kg: 92.9 })
    await expect(undoReceipt(deps, receipt!.id)).rejects.toMatchObject({ status: 409, code: 'superseded' })
    expect(await weightOn('2026-10-25')).toEqual([expect.objectContaining({ id: again, weight_kg: 92.9 })])
    const [stored] = await db.select().from(chat_receipts).where(eq(chat_receipts.id, receipt!.id))
    expect(stored!.undone_at).toBeNull()
  })

  it('a weight read from a screenshot is not logged when his text only asks "what\'s this?"', async () => {
    const { llm, chats } = fakeRouter(
      { ...empty, facts: [{ kind: 'weight', source: 'screenshot', days_ago: 3, weight_kg: 80.1 }] },
      'That screenshot shows 80.1 kg. Shall I log it?',
    )
    const out = await chatTurn(deps, llm, {
      ...send("what's this?"),
      attachments: [{ tag: 'screenshot', id: crypto.randomUUID() }],
    })
    expect(out.reply.receipts).toEqual([])
    expect(await weightOn('2026-10-26')).toEqual([])
    expect(chats[0]!.messages.at(-1)!.content).toMatch(/Seen in the screenshot, not logged.*weight 80\.1 kg/)
  })

  it('a queued dump typed at 22:40 and sent at 07:10 files "this morning" on the day it was typed', async () => {
    // Typed Wed Oct 28 22:40 MDT; processed Thu Oct 29 07:10 MDT.
    const queued: Deps = { ...deps, now: () => new Date('2026-10-29T13:10:00.000Z') }
    const { llm, completes } = fakeRouter(
      { ...empty, facts: [{ kind: 'weight', days_ago: 0, weight_kg: 92.6 }] },
      'Logged.',
    )
    const out = await chatTurn(queued, llm, {
      ...send('92.6 this morning'),
      sent_at: '2026-10-29T04:40:00.000Z',
    })
    expect(out.reply.receipts.map((r) => r.date)).toEqual(['2026-10-28'])
    expect(completes[0]!.system).toMatch(/Wednesday 2026-10-28, 22:40/)
    expect(
      await db
        .select()
        .from(weight_logs)
        .where(and(eq(weight_logs.date, '2026-10-28'), eq(weight_logs.weight_kg, 92.6))),
    ).toHaveLength(1)
  })
})
