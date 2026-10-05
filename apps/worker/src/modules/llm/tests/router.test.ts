// Owns: the llm module's entry-point tests — failover, schema repair, the 80 % daily guard, vision routing, the
// tool-call loop with Gemini thought signatures, and the requeue errors. Providers are fake fetches; D1 is real.
import { MealAnalysisOutput } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import { createDb, provider_usage } from '../../../db'
import type { Deps } from '../../../lib/deps'
import {
  BudgetError,
  createLlmRouter,
  DeadlineError,
  ProvidersExhaustedError,
  type Msg,
  type ProvidersConfig,
} from '../index'

/** 18:00 UTC = 11:00 in Los Angeles, so Gemini's quota day (Pacific) is 2026-10-05. */
const NOW = new Date('2026-10-05T18:00:00.000Z')

function deps(now: () => Date = () => NOW): Deps {
  return {
    db: createDb(env.DB),
    env: { ...env, GEMINI_API_KEY: 'test-gemini-key', ZAI_API_KEY: 'test-zai-key' },
    now,
    actor: 'ai',
    waitUntil: () => {},
  }
}

/** Two providers, three models. Each test passes its own tag so quota rows and RPM buckets don't overlap. */
function config(tag: string): ProvidersConfig {
  return {
    checked: '2026-10-05',
    background_share: 0.8,
    retry: { max_retries: 1, base_ms: 1, max_wait_ms: 50 },
    providers: {
      gemini: { api: 'gemini', base_url: 'https://gemini.test/v1beta', key_env: 'GEMINI_API_KEY' },
      zai: { api: 'openai', base_url: 'https://zai.test/api/paas/v4', key_env: 'ZAI_API_KEY' },
    },
    quotas: {
      [`gemini-${tag}`]: { rpm: 1000, rpd: 100, tpm: null, tpd: null, day_tz: 'America/Los_Angeles' },
      [`zai-${tag}`]: { rpm: 1000, rpd: null, tpm: null, tpd: null },
    },
    models: {
      'gemini-flash': {
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        quota: `gemini-${tag}`,
        vision: true,
        tools: true,
        json: 'native',
      },
      'glm-text': {
        provider: 'zai',
        model: 'glm-4.7-flash',
        quota: `zai-${tag}`,
        vision: false,
        tools: true,
        json: 'json_object',
      },
      'glm-vision': {
        provider: 'zai',
        model: 'glm-4.6v-flash',
        quota: `zai-${tag}`,
        vision: true,
        tools: true,
        json: 'prompt',
      },
    },
    // The vision chain lists a text-only model on purpose: the router must skip it.
    chains: { text: ['gemini-flash', 'glm-text'], vision: ['gemini-flash', 'glm-text', 'glm-vision'] },
  }
}

interface Sent {
  host: string
  model: string
  body: any
}

function fakeFetch(reply: (sent: Sent, n: number) => Response | Promise<Response>) {
  const sent: Sent[] = []
  const fetch = async (url: string, init: RequestInit) => {
    const u = new URL(url)
    const body = JSON.parse(init.body as string)
    const s = {
      host: u.host,
      model: u.host === 'gemini.test' ? u.pathname.split('/models/')[1]!.split(':')[0]! : body.model,
      body,
    }
    sent.push(s)
    return reply(s, sent.length)
  }
  return { fetch, sent }
}

const geminiReply = (parts: object[], usage = { promptTokenCount: 120, candidatesTokenCount: 40 }) =>
  Response.json({
    candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }],
    usageMetadata: usage,
  })
const glmReply = (content: string) =>
  Response.json({
    choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: 30 },
  })
const unavailable = () => Response.json({ error: { code: 503, status: 'UNAVAILABLE' } }, { status: 503 })

const lunch = {
  items: [
    {
      name: 'chicken breast',
      grams: 150,
      confidence: 0.9,
      candidates: [{ source: 'cnf', source_id: '1234' }],
      estimate: null,
    },
  ],
  notes: 'Grilled, no sauce.',
}
const mealCall = (priority: 'user' | 'background' = 'user') => ({
  job: 'meal_analysis' as const,
  system: 'List the foods in the meal with grams.',
  messages: [{ role: 'user' as const, content: '150 g grilled chicken breast' }],
  schema: MealAnalysisOutput,
  priority,
})

describe('llm router', () => {
  it('falls over to GLM when Gemini answers 503, and returns validated data', async () => {
    const { fetch, sent } = fakeFetch((s) =>
      s.host === 'gemini.test' ? unavailable() : glmReply(JSON.stringify(lunch)),
    )
    const llm = createLlmRouter(deps(), { fetch, config: config('failover') })

    const r = await llm.complete(mealCall())

    expect(r).toMatchObject({
      data: lunch,
      provider: 'zai',
      model: 'glm-4.7-flash',
      tokens_in: 100,
      tokens_out: 30,
      attempts: 3,
    })
    expect(sent.map((s) => s.model)).toEqual(['gemini-3.8-flash', 'gemini-3.8-flash', 'glm-4.7-flash'])
    expect(sent[2]!.body.response_format).toEqual({ type: 'json_object' })
  })

  it('sends the validation error back once and accepts the repaired JSON', async () => {
    const wrong = { ...lunch, items: [{ ...lunch.items[0], grams: -150 }] }
    const { fetch, sent } = fakeFetch((_s, n) =>
      geminiReply([{ text: JSON.stringify(n === 1 ? wrong : lunch) }]),
    )
    const llm = createLlmRouter(deps(), { fetch, config: config('repair') })

    const r = await llm.complete(mealCall())

    expect(r).toMatchObject({
      data: lunch,
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      attempts: 2,
      tokens_in: 240,
      tokens_out: 80,
    })
    const repairTurn = sent[1]!.body.contents.at(-1)
    expect(repairTurn.role).toBe('user')
    expect(repairTurn.parts[0].text).toContain('items[0].grams')
    expect(sent[0]!.body.generationConfig).toMatchObject({ responseMimeType: 'application/json' })
  })

  it('stops background jobs at 80 % of a daily quota but lets user jobs through', async () => {
    await createDb(env.DB)
      .insert(provider_usage)
      .values({ provider: 'gemini-budget', day: '2026-10-05', requests: 80 })
    const { fetch, sent } = fakeFetch((s) =>
      s.host === 'gemini.test'
        ? geminiReply([{ text: JSON.stringify(lunch) }])
        : glmReply(JSON.stringify(lunch)),
    )
    const llm = createLlmRouter(deps(), { fetch, config: config('budget') })

    const background = await llm.complete(mealCall('background'))
    const user = await llm.complete(mealCall('user'))

    expect(background.provider).toBe('zai')
    expect(user.provider).toBe('gemini')
    expect(sent.map((s) => s.host)).toEqual(['zai.test', 'gemini.test'])
  })

  it('never sends a vision job to a text-only model', async () => {
    const { fetch, sent } = fakeFetch(() => unavailable())
    const llm = createLlmRouter(deps(), { fetch, config: config('vision') })
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff]).buffer

    const call = llm.complete({
      ...mealCall(),
      job: 'scan_extract',
      images: [{ mime: 'image/jpeg', data: jpeg }],
    })

    await expect(call).rejects.toBeInstanceOf(ProvidersExhaustedError)
    expect(new Set(sent.map((s) => s.model))).toEqual(new Set(['gemini-3.8-flash', 'glm-4.6v-flash']))
    expect(sent[0]!.body.contents[0].parts[0]).toEqual({
      inlineData: { mimeType: 'image/jpeg', data: '/9j/' },
    })
    expect(sent.at(-1)!.body.messages[1].content[0]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/jpeg;base64,/9j/' },
    })
  })

  it('returns tool calls and replays the Gemini turn with its thought signature verbatim', async () => {
    const signature = 'c2lnbmVkLWJ5LWdlbWluaQ=='
    const callPart = {
      functionCall: { id: 'fc_1', name: 'get_today', args: { date: '2026-10-05' } },
      thoughtSignature: signature,
    }
    const { fetch, sent } = fakeFetch((_s, n) =>
      geminiReply(n === 1 ? [callPart] : [{ text: 'You have 620 kcal left today.' }]),
    )
    const llm = createLlmRouter(deps(), { fetch, config: config('tools') })
    const tools = [
      {
        name: 'get_today',
        description: "Today's targets and intake",
        parameters: z.object({ date: z.iso.date() }),
      },
    ]
    const history: Msg[] = [{ role: 'user', content: 'How much can I still eat today?' }]

    const first = await llm.chat({
      job: 'ask_ai',
      system: 'You are the coach.',
      messages: history,
      tools,
      priority: 'user',
    })
    expect(first.type).toBe('tool_calls')
    if (first.type !== 'tool_calls') return
    expect(first.toolCalls).toEqual([{ id: 'fc_1', name: 'get_today', args: { date: '2026-10-05' } }])

    const second = await llm.chat({
      job: 'ask_ai',
      system: 'You are the coach.',
      messages: [
        ...history,
        first.message,
        { role: 'tool', toolCallId: 'fc_1', name: 'get_today', content: '{"remaining_kcal":620}' },
      ],
      tools,
      priority: 'user',
    })

    expect(second).toMatchObject({ type: 'reply', data: 'You have 620 kcal left today.' })
    expect(sent[0]!.body.tools[0].functionDeclarations[0].parametersJsonSchema).toMatchObject({
      type: 'object',
      required: ['date'],
    })
    expect(sent[1]!.body.contents[1]).toEqual({ role: 'model', parts: [callPart] })
    expect(sent[1]!.body.contents[2]).toEqual({
      role: 'user',
      parts: [{ functionResponse: { id: 'fc_1', name: 'get_today', response: { remaining_kcal: 620 } } }],
    })
  })

  it('signals a requeue: DeadlineError past the deadline, BudgetError when the fetch budget is spent', async () => {
    let clock = NOW.getTime()
    const slow = fakeFetch(() => {
      clock += 26_000
      return unavailable()
    })
    const late = createLlmRouter(
      deps(() => new Date(clock)),
      { fetch: slow.fetch, config: config('deadline') },
    )
    await expect(late.complete(mealCall())).rejects.toBeInstanceOf(DeadlineError)
    expect(slow.sent).toHaveLength(1)

    const failing = fakeFetch(() => unavailable())
    const budget = { limit: 2, used: 0 }
    const capped = createLlmRouter(deps(), { fetch: failing.fetch, config: config('fetch-budget'), budget })
    await expect(capped.complete(mealCall())).rejects.toBeInstanceOf(BudgetError)
    expect(failing.sent).toHaveLength(2)
  })
})
