// Owns: running one call down the provider chain — key and budget checks, RPM pacing, retries with backoff on
// 429/5xx/timeouts (Retry-After respected), one schema repair per model, failover, the overall deadline and the
// usage rows. Logs carry provider, model, reason and status only: never prompt, image or reply content.
import * as z from 'zod'
import type { Deps } from '../../../lib/deps'
import {
  candidatesFor,
  defaultConfig,
  ProvidersConfig,
  type Candidate,
  type ProvidersConfigInput,
} from './config'
import {
  AttemptFailure,
  DeadlineError,
  ProvidersExhaustedError,
  type FailureReason,
  type ProviderFailure,
} from './errors'
import { geminiAdapter } from './gemini'
import { extractJson, jsonSchemaOf, repairInstruction, toBase64 } from './json'
import {
  coolDown,
  coolingDown,
  loadUsage,
  overDailyBudget,
  quotaDay,
  recordExhausted,
  recordUsage,
  takeRpmToken,
  type DayUsage,
} from './limits'
import { openaiAdapter } from './openai'
import { send, type FetchBudget, type FetchFn } from './transport'
import type {
  AssistantMsg,
  ChatRequest,
  ChatResult,
  CompleteRequest,
  CompleteResult,
  Msg,
  ModelTurn,
  PreparedCall,
} from './types'

export interface RouterOptions {
  /** The HTTP client (tests pass a fake). Defaults to the global fetch. */
  fetch?: FetchFn
  /** Replaces providers.json (tests, experiments). Validated on creation. */
  config?: ProvidersConfigInput
  /** External fetches allowed for this invocation; share one object with other fetching modules. Default {limit: 40}. */
  budget?: FetchBudget
  /** Default overall deadline per call (25,000 ms: waitUntil allows 30 s). */
  deadlineMs?: number
}

const DEFAULT_DEADLINE_MS = 25_000
const DEFAULT_MAX_TOKENS = 4_096
const DEFAULT_FETCH_BUDGET = 40
/** Don't start an attempt with less time than this left: an LLM can't answer in it. */
const MIN_ATTEMPT_MS = 1_000
const DEFAULT_COOLDOWN_MS = 60_000
const DAILY_QUOTA_COOLDOWN_MS = 60 * 60_000

const adapters = { gemini: geminiAdapter, openai: openaiAdapter } as const
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function createRouter(deps: Deps, opts: RouterOptions = {}) {
  const config = opts.config ? ProvidersConfig.parse(opts.config) : defaultConfig
  const fetchFn: FetchFn = opts.fetch ?? ((input, init) => fetch(input, init))
  const budget = opts.budget ?? { limit: DEFAULT_FETCH_BUDGET, used: 0 }
  // Its own cap and the invocation's tally (deps.budget), so jobs and requests in one invocation stay under 50.
  const budgets = deps.budget ? [budget, deps.budget] : [budget]
  const nowMs = () => deps.now().getTime()

  async function chat<T = string>(req: ChatRequest<T>): Promise<ChatResult<T>> {
    const start = nowMs()
    const deadlineMs = req.deadlineMs ?? opts.deadlineMs ?? DEFAULT_DEADLINE_MS
    const remaining = () => start + deadlineMs - nowMs()

    const prepared: PreparedCall = {
      system: req.system,
      messages: req.messages,
      images: (req.images ?? []).map((i) => ({ mime: i.mime, base64: toBase64(i.data) })),
      tools: (req.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters instanceof z.ZodType ? jsonSchemaOf(t.parameters) : t.parameters,
      })),
      jsonSchema: req.schema ? jsonSchemaOf(req.schema) : null,
      maxTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    }
    const candidates = candidatesFor(config, req.job, {
      vision: prepared.images.length > 0,
      tools: prepared.tools.length > 0,
    })

    const today = deps.now()
    const days = new Map(candidates.map((c) => [c.quotaKey, quotaDay(c.quota, today)]))
    let usage: Map<string, DayUsage>
    try {
      usage = await loadUsage(
        deps.db,
        [...days].map(([key, day]) => ({ key, day })),
      )
    } catch {
      console.warn(JSON.stringify({ at: 'llm', job: req.job, event: 'usage_read_failed' }))
      usage = new Map()
    }

    const failures: ProviderFailure[] = []
    let attempts = 0
    let tokensIn = 0
    let tokensOut = 0

    /** Count one request against the quota day, in memory for this call and in provider_usage for everyone. */
    async function track(c: Candidate, tin: number, tout: number) {
      const day = days.get(c.quotaKey)!
      const k = `${c.quotaKey}|${day}`
      const u = usage.get(k) ?? { requests: 0, tokens: 0 }
      usage.set(k, { requests: u.requests + 1, tokens: u.tokens + tin + tout })
      try {
        await recordUsage(deps.db, c.quotaKey, day, tin, tout, deps.now())
      } catch {
        console.warn(
          JSON.stringify({ at: 'llm', job: req.job, event: 'usage_write_failed', quota: c.quotaKey }),
        )
      }
    }

    const meta = (c: Candidate) => ({
      provider: c.providerName,
      model: c.spec.model,
      latency_ms: nowMs() - start,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      attempts,
    })

    for (const c of candidates) {
      const fail = (reason: FailureReason, status?: number) =>
        failures.push({
          provider: c.providerName,
          model: c.spec.model,
          reason,
          ...(status !== undefined ? { status } : {}),
        })

      const key = deps.env[c.provider.key_env]
      if (!key) {
        fail('no_key')
        continue
      }
      if (
        overDailyBudget(
          c.quota,
          usage.get(`${c.quotaKey}|${days.get(c.quotaKey)}`),
          req.priority,
          config.background_share,
        )
      ) {
        fail('quota')
        continue
      }
      if (coolingDown(c.quotaKey, nowMs())) {
        fail('cooldown')
        continue
      }

      const adapter = adapters[c.provider.api]
      let messages: Msg[] = req.messages
      let retries = 0
      let repaired = false
      let paced = false

      for (;;) {
        // RPM pacing: wait briefly for a token, otherwise move on to the next model.
        const wait = takeRpmToken(c.quotaKey, c.quota.rpm, nowMs())
        if (wait > 0) {
          if (paced || wait > config.retry.max_wait_ms || wait > remaining() - MIN_ATTEMPT_MS) {
            fail('rate_limited')
            break
          }
          paced = true
          await sleep(wait)
          continue
        }
        paced = false
        if (remaining() < MIN_ATTEMPT_MS) throw new DeadlineError(deadlineMs)

        attempts++
        let turn: ModelTurn
        try {
          const wire = adapter.build(c.provider, c.spec, key, { ...prepared, messages })
          turn = adapter.parse(
            c.spec,
            await send(fetchFn, budgets, wire, Math.min(c.spec.timeout_ms, remaining()), nowMs()),
          )
        } catch (e) {
          if (!(e instanceof AttemptFailure)) throw e // BudgetError and programming errors
          if (e.status !== 429 && e.reason !== 'network') await track(c, 0, 0)
          if (remaining() <= 0) throw new DeadlineError(deadlineMs)
          console.warn(
            JSON.stringify({
              at: 'llm',
              job: req.job,
              provider: c.providerName,
              model: c.spec.model,
              reason: e.reason,
              status: e.status,
              code: e.code,
            }),
          )
          if (e.reason === 'rate_limited' && e.code === 'DAILY_QUOTA') {
            coolDown(c.quotaKey, nowMs() + DAILY_QUOTA_COOLDOWN_MS)
            if (c.quota.rpd !== null)
              await recordExhausted(
                deps.db,
                c.quotaKey,
                days.get(c.quotaKey)!,
                c.quota.rpd,
                deps.now(),
              ).catch(() => undefined)
            fail('quota', e.status)
            break
          }
          if (e.retryable && retries < config.retry.max_retries) {
            const backoff = e.retryAfterMs ?? config.retry.base_ms * 2 ** retries * (1 + Math.random() * 0.25)
            if (backoff <= config.retry.max_wait_ms && backoff < remaining() - MIN_ATTEMPT_MS) {
              retries++
              await sleep(backoff)
              continue
            }
          }
          if (e.reason === 'rate_limited')
            coolDown(c.quotaKey, nowMs() + (e.retryAfterMs ?? DEFAULT_COOLDOWN_MS))
          fail(e.reason, e.status)
          break
        }

        tokensIn += turn.tokensIn
        tokensOut += turn.tokensOut
        await track(c, turn.tokensIn, turn.tokensOut)

        const message: AssistantMsg = {
          role: 'assistant',
          content: turn.text,
          ...(turn.toolCalls.length ? { toolCalls: turn.toolCalls } : {}),
          ...(turn.native ? { native: turn.native } : {}),
        }
        if (turn.finish === 'blocked') {
          fail('blocked')
          break
        }
        if (turn.toolCalls.length) {
          if (prepared.tools.length)
            return { type: 'tool_calls', toolCalls: turn.toolCalls, message, ...meta(c) }
          fail('invalid_output')
          break
        }
        if (!req.schema) {
          if (turn.text.trim()) return { type: 'reply', data: turn.text as T, message, ...meta(c) }
          fail('invalid_output')
          break
        }
        const json = extractJson(turn.text)
        const parsed = req.schema.safeParse(json)
        if (parsed.success) return { type: 'reply', data: parsed.data, message, ...meta(c) }
        if (!repaired) {
          repaired = true
          const error =
            json === undefined ? 'The reply was not parseable JSON.' : z.prettifyError(parsed.error)
          messages = [...messages, message, { role: 'user', content: repairInstruction(error) }]
          continue
        }
        fail('invalid_output')
        break
      }
    }
    throw new ProvidersExhaustedError(failures)
  }

  async function complete<T>(req: CompleteRequest<T>): Promise<CompleteResult<T>> {
    const r = await chat<T>(req)
    if (r.type !== 'reply')
      throw new ProvidersExhaustedError([{ provider: r.provider, model: r.model, reason: 'invalid_output' }])
    return {
      data: r.data,
      provider: r.provider,
      model: r.model,
      latency_ms: r.latency_ms,
      tokens_in: r.tokens_in,
      tokens_out: r.tokens_out,
      attempts: r.attempts,
    }
  }

  return { chat, complete }
}
