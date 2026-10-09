// Owns: the llm module's entry-point tests — failover, schema repair, the 80 % daily guard, vision routing, the
// tool-call loop with Gemini thought signatures and with Anthropic thinking blocks, name redaction on the wire, the
// paid-first fallback reserve, refused keys, and the requeue errors. Providers are fake fetches; D1 is real.
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

function deps(now: () => Date = () => NOW, keys: Partial<Deps['env']> = {}): Deps {
  return {
    db: createDb(env.DB),
    env: {
      ...env,
      GEMINI_API_KEY: 'test-gemini-key',
      ZAI_API_KEY: 'test-zai-key',
      ANTHROPIC_API_KEY: 'test-anthropic-key',
      ...keys,
    },
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

/** A paid provider first, a free one second: the shape of the shipped chains once a paid key is set. */
function paidConfig(tag: string): ProvidersConfig {
  return {
    checked: '2026-10-08',
    background_share: 0.8,
    retry: { max_retries: 1, base_ms: 1, max_wait_ms: 50 },
    providers: {
      anthropic: {
        api: 'anthropic',
        base_url: 'https://anthropic.test/v1',
        key_env: 'ANTHROPIC_API_KEY',
        headers: { 'anthropic-version': '2023-06-01' },
      },
      zai: { api: 'openai', base_url: 'https://zai.test/api/paas/v4', key_env: 'ZAI_API_KEY' },
    },
    quotas: {
      [`anthropic-${tag}`]: { rpm: 1000, rpd: 200, tpm: null, tpd: null },
      [`zai-${tag}`]: { rpm: 1000, rpd: null, tpm: null, tpd: null },
    },
    models: {
      claude: {
        provider: 'anthropic',
        model: 'claude-opus-5-5',
        quota: `anthropic-${tag}`,
        vision: true,
        tools: true,
        json: 'prompt',
        params: { output_config: { effort: 'low' } },
        paid: true,
      },
      'glm-text': {
        provider: 'zai',
        model: 'glm-4.7-flash',
        quota: `zai-${tag}`,
        vision: false,
        tools: true,
        json: 'json_object',
      },
    },
    chains: { text: ['claude', 'glm-text'], vision: ['claude'] },
  }
}

interface Sent {
  host: string
  model: string
  headers: Record<string, string>
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
      headers: init.headers as Record<string, string>,
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
const claudeReply = (text: string) =>
  Response.json({
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 30 },
  })

/**
 * Claude answers after `ms` (never, by default) unless the router's per-attempt timeout aborts it first; GLM answers
 * at once. Real time: the abort comes from AbortSignal.timeout.
 */
function slowClaude(ms = 60_000) {
  const sent: string[] = []
  const fetch = (url: string, init: RequestInit) => {
    const host = new URL(url).host
    sent.push(host)
    if (host === 'zai.test') return Promise.resolve(glmReply(JSON.stringify(lunch)))
    return new Promise<Response>((resolve, reject) => {
      const t = setTimeout(() => resolve(claudeReply(JSON.stringify(lunch))), ms)
      init.signal!.addEventListener('abort', () => {
        clearTimeout(t)
        reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))
      })
    })
  }
  return { fetch, sent }
}

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

  it('runs the tool loop through the Anthropic adapter and replays its thinking block verbatim', async () => {
    const thinking = {
      type: 'thinking',
      thinking: "Today's numbers first.",
      signature: 'c2lnbmVkLWJ5LWNsYXVkZQ==',
    }
    const toolUse = { type: 'tool_use', id: 'toolu_1', name: 'get_today', input: { date: '2026-10-05' } }
    const { fetch, sent } = fakeFetch((_s, n) =>
      Response.json(
        n === 1
          ? {
              type: 'message',
              role: 'assistant',
              content: [thinking, toolUse],
              stop_reason: 'tool_use',
              usage: { input_tokens: 200, output_tokens: 50 },
            }
          : {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'text', text: 'You have 620 kcal left today.' }],
              stop_reason: 'end_turn',
              usage: { input_tokens: 300, output_tokens: 20, cache_read_input_tokens: 10 },
            },
      ),
    )
    const llm = createLlmRouter(deps(), { fetch, config: paidConfig('anthropic') })
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
      maxTokens: 1234,
      priority: 'user',
    })

    expect(sent[0]!.host).toBe('anthropic.test')
    expect(sent[0]!.headers).toMatchObject({
      'x-api-key': 'test-anthropic-key',
      'anthropic-version': '2023-06-01',
    })
    const body = sent[0]!.body
    expect(typeof body.system).toBe('string')
    expect(body.tools[0].input_schema).toMatchObject({ type: 'object', required: ['date'] })
    expect(body.max_tokens).toBe(1234)
    expect(body.output_config).toEqual({ effort: 'low' })
    expect(body).not.toHaveProperty('thinking')
    expect(body).not.toHaveProperty('tool_choice')
    expect(first).toMatchObject({ type: 'tool_calls', provider: 'anthropic', tokens_in: 200, tokens_out: 50 })
    if (first.type !== 'tool_calls') return
    expect(first.toolCalls).toEqual([{ id: 'toolu_1', name: 'get_today', args: { date: '2026-10-05' } }])
    expect(first.message.native?.provider).toBe('anthropic')

    const second = await llm.chat({
      job: 'ask_ai',
      system: 'You are the coach.',
      messages: [
        ...history,
        first.message,
        { role: 'tool', toolCallId: 'toolu_1', name: 'get_today', content: '{"ok":true}' },
      ],
      tools,
      priority: 'user',
    })

    expect(second).toMatchObject({
      type: 'reply',
      data: 'You have 620 kcal left today.',
      tokens_in: 310,
      tokens_out: 20,
    })
    const replay = sent[1]!.body.messages
    expect(replay).toHaveLength(3)
    expect(replay[1]).toEqual({ role: 'assistant', content: [thinking, toolUse] })
    expect(replay[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"ok":true}' }],
    })
  })

  it('redacts the name from every text a model reads: system, messages, tool results, tool descriptions', async () => {
    const { fetch, sent } = fakeFetch(() => geminiReply([{ text: 'Rows first, then the press.' }]))
    const llm = createLlmRouter(deps(), { fetch, config: config('redact') })

    await llm.chat({
      job: 'ask_ai',
      system: "You are the coach at Aaron's gym.",
      messages: [
        { role: 'user', content: 'Aaron wants a pull day.' },
        {
          role: 'assistant',
          content: "Checking Aaron's equipment.",
          toolCalls: [{ id: 'fc_1', name: 'get_equipment', args: { area: 'racks' } }],
        },
        {
          role: 'tool',
          toolCallId: 'fc_1',
          name: 'get_equipment',
          content: JSON.stringify({ note: "not on Aaron's list; assumed with the racks" }),
        },
      ],
      tools: [
        {
          name: 'get_equipment',
          description: "The machines at Aaron's gym",
          parameters: z.object({ area: z.string() }),
        },
      ],
      priority: 'user',
    })

    const wire = JSON.stringify(sent[0]!.body)
    expect(wire).not.toMatch(/aaron/i)
    expect(wire).toContain("You are the coach at the user's gym.")
    expect(wire).toContain('the user wants a pull day.')
    expect(sent[0]!.body.contents[2].parts[0].functionResponse.response).toEqual({
      note: "not on the user's list; assumed with the racks",
    })
    expect(sent[0]!.body.tools[0].functionDeclarations[0].description).toBe("The machines at the user's gym")
    expect(sent[0]!.body.contents[1].parts[1].functionCall.args).toEqual({ area: 'racks' })
  })

  it('leaves time for a free model when a paid one hangs, the reserve capped at 40 % of the deadline', async () => {
    const { fetch, sent } = slowClaude()
    const cfg = { ...paidConfig('slowpaid'), paid_fallback_reserve_ms: 6_000 }
    cfg.models.claude = { ...cfg.models.claude!, timeout_ms: 60_000 }
    const llm = createLlmRouter(
      deps(() => new Date()),
      { fetch, config: cfg },
    )

    // 6 s of reserve would leave Claude nothing; capped at 40 % of 3 s, Claude may use 1.8 s and 1.2 s stays for GLM.
    const r = await llm.complete({ ...mealCall(), deadlineMs: 3_000 })

    expect(r).toMatchObject({ data: lunch, provider: 'zai', model: 'glm-4.7-flash' })
    expect(sent).toEqual(['anthropic.test', 'zai.test'])
  })

  it('does not ask a paid model that timed out again, though the time would allow it', async () => {
    const { fetch, sent } = slowClaude()
    const cfg = { ...paidConfig('noretry'), paid_fallback_reserve_ms: 1_200 }
    cfg.models.claude = { ...cfg.models.claude!, timeout_ms: 600 }
    const llm = createLlmRouter(
      deps(() => new Date()),
      { fetch, config: cfg },
    )

    // Claude times out at 0.6 s with 3.2 s to spare beyond the reserve: a retry would fit, and must not happen.
    const r = await llm.complete({ ...mealCall(), deadlineMs: 5_000 })

    expect(r).toMatchObject({ data: lunch, provider: 'zai' })
    expect(sent).toEqual(['anthropic.test', 'zai.test'])
  })

  it('gives a paid model the whole deadline when no model after it could answer', async () => {
    const { fetch, sent } = slowClaude(2_500)
    const cfg = { ...paidConfig('paidalone'), paid_fallback_reserve_ms: 1_200 }
    const llm = createLlmRouter(
      deps(() => new Date(), { ZAI_API_KEY: undefined }),
      { fetch, config: cfg },
    )

    // GLM has no key, so nothing is held back for it: Claude may answer at 2.5 s of a 3 s deadline.
    const r = await llm.complete({ ...mealCall(), deadlineMs: 3_000 })

    expect(r).toMatchObject({ data: lunch, provider: 'anthropic' })
    expect(sent).toEqual(['anthropic.test'])
  })

  it("lets a paid 429 fall through with its cooldown rather than sleep into the fallback's time", async () => {
    const { fetch, sent } = fakeFetch((s) =>
      s.host === 'anthropic.test'
        ? Response.json(
            { type: 'error', error: { type: 'rate_limit_error' } },
            { status: 429, headers: { 'retry-after': '1' } },
          )
        : glmReply(JSON.stringify(lunch)),
    )
    const cfg = {
      ...paidConfig('paid429'),
      paid_fallback_reserve_ms: 1_200,
      retry: { max_retries: 1, base_ms: 1, max_wait_ms: 2_000 },
    }
    const llm = createLlmRouter(deps(), { fetch, config: cfg })

    // The clock stands still at 3 s left: a 1 s wait fits, but not beside GLM's 1.2 s and one attempt's 1 s.
    expect(await llm.complete({ ...mealCall(), deadlineMs: 3_000 })).toMatchObject({ provider: 'zai' })
    expect(await llm.complete({ ...mealCall(), deadlineMs: 3_000 })).toMatchObject({ provider: 'zai' })

    expect(sent.map((s) => s.host)).toEqual(['anthropic.test', 'zai.test', 'zai.test'])
  })

  it('skips a paid model with no time beside its fallback as deadline_reserved, no reason to wait', async () => {
    const { fetch, sent } = fakeFetch(() =>
      Response.json({ error: { type: 'insufficient_quota' } }, { status: 429 }),
    )
    const llm = createLlmRouter(deps(), { fetch, config: paidConfig('reserved') })

    // 1.5 s: the reserve (40 % = 0.6 s, raised to one attempt's 1 s) leaves Claude 0.5 s, too little to start.
    const err = await llm.complete({ ...mealCall(), deadlineMs: 1_500 }).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ProvidersExhaustedError)
    expect(err).toMatchObject({
      quotaOnly: false,
      failures: [
        { provider: 'anthropic', model: 'claude-opus-5-5', reason: 'deadline_reserved' },
        { provider: 'zai', model: 'glm-4.7-flash', reason: 'quota', status: 429 },
      ],
    })
    expect(sent.map((s) => s.host)).toEqual(['zai.test'])
  })

  it('skips a paid model whose key was refused, without a fetch, until a different key is set', async () => {
    const { fetch, sent } = fakeFetch((s) =>
      s.host !== 'anthropic.test'
        ? glmReply(JSON.stringify(lunch))
        : s.headers['x-api-key'] === 'fixed-anthropic-key'
          ? claudeReply(JSON.stringify(lunch))
          : Response.json(
              { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
              { status: 401 },
            ),
    )
    const llm = createLlmRouter(deps(), { fetch, config: paidConfig('refusedkey') })

    expect(await llm.complete(mealCall())).toMatchObject({ provider: 'zai' })
    expect(await llm.complete(mealCall())).toMatchObject({ provider: 'zai' })
    // A new key saved in Settings: the next router resolves it and Claude is asked again at once.
    const fixed = createLlmRouter(deps(undefined, { ANTHROPIC_API_KEY: 'fixed-anthropic-key' }), {
      fetch,
      config: paidConfig('refusedkey'),
    })
    expect(await fixed.complete(mealCall())).toMatchObject({ provider: 'anthropic' })

    expect(sent.map((x) => x.host)).toEqual(['anthropic.test', 'zai.test', 'zai.test', 'anthropic.test'])
  })

  it('reports a skipped refused key as client, not a reason to wait, when no other model has a key', async () => {
    const { fetch, sent } = fakeFetch(() =>
      Response.json({ type: 'error', error: { type: 'billing_error' } }, { status: 402 }),
    )
    const llm = createLlmRouter(deps(undefined, { ZAI_API_KEY: undefined }), {
      fetch,
      config: paidConfig('refusedwait'),
    })

    await expect(llm.complete(mealCall())).rejects.toBeInstanceOf(ProvidersExhaustedError)
    const err = await llm.complete(mealCall()).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ProvidersExhaustedError)
    expect(err).toMatchObject({
      quotaOnly: false,
      failures: [
        { provider: 'anthropic', reason: 'client' },
        { provider: 'zai', reason: 'no_key' },
      ],
    })
    expect(sent.map((s) => s.host)).toEqual(['anthropic.test'])
  })

  it('keeps asking a free model that answered 403 (a moderation block there, not a refused key)', async () => {
    const { fetch, sent } = fakeFetch((s) =>
      s.host === 'gemini.test'
        ? Response.json({ error: { code: 403, status: 'PERMISSION_DENIED' } }, { status: 403 })
        : glmReply(JSON.stringify(lunch)),
    )
    const llm = createLlmRouter(deps(), { fetch, config: config('free403') })

    expect(await llm.complete(mealCall())).toMatchObject({ provider: 'zai' })
    expect(await llm.complete(mealCall())).toMatchObject({ provider: 'zai' })

    expect(sent.map((s) => s.host)).toEqual(['gemini.test', 'zai.test', 'gemini.test', 'zai.test'])
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
