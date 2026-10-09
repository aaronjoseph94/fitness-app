// Owns: running one call down the provider chain — key and budget checks, RPM pacing, retries with backoff on
// 429/5xx/timeouts (Retry-After respected), one schema repair per model, failover, the overall deadline and the
// usage rows. It is the one place text leaves for a model: the system prompt, every message's text and every tool
// description pass redactName first (SPEC §9 privacy); images, tool-call args and JSON schemas go as they are.
// Paid models lead and leave time for a free one (paid_fallback_reserve_ms, at most 40 % of the deadline, held back
// only when a later model could answer; a timed-out paid model is not retried). A refused key skips its model while
// that same key is set; spent credit or a 429 puts the model on a cooldown so the next calls skip it.
// Logs carry provider, model, reason and status only: never prompt, image or reply content.
import * as z from 'zod'
import type { Deps } from '../../../lib/deps'
import { redactName } from '../../../lib/redact'
import { anthropicAdapter } from './anthropic'
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
import { createKeyResolver } from './keys'
import {
  coolDown,
  coolingDown,
  keyRefused,
  loadUsage,
  overDailyBudget,
  quotaDay,
  recordExhausted,
  recordUsage,
  refuseKey,
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
/** A key refused (401/402, or 403 on a paid model): its model is skipped this long while that same key is set. */
const AUTH_COOLDOWN_MS = 10 * 60_000
/** The most of a call's deadline the fallback reserve may take, so a short deadline still leaves a paid model time. */
const RESERVE_SHARE = 0.4
/** Provider codes that mean "no credit left today": treated like a spent daily quota. */
const OUT_OF_CREDIT = new Set(['DAILY_QUOTA', 'insufficient_quota'])

const adapters = { gemini: geminiAdapter, openai: openaiAdapter, anthropic: anthropicAdapter } as const
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
/** A message as a model may read it: its text redacted; tool-call args and a provider's native replay left verbatim. */
const redactMsg = (m: Msg): Msg => ({ ...m, content: redactName(m.content) })

export function createRouter(deps: Deps, opts: RouterOptions = {}) {
  const config = opts.config ? ProvidersConfig.parse(opts.config) : defaultConfig
  const fetchFn: FetchFn = opts.fetch ?? ((input, init) => fetch(input, init))
  const budget = opts.budget ?? { limit: DEFAULT_FETCH_BUDGET, used: 0 }
  // Its own cap and the invocation's tally (deps.budget), so jobs and requests in one invocation stay under 50.
  const budgets = deps.budget ? [budget, deps.budget] : [budget]
  const nowMs = () => deps.now().getTime()
  // Provider keys: what Aaron stored in the app first, the Worker secret second (one read per router).
  const resolveKey = createKeyResolver(deps)

  async function chat<T = string>(req: ChatRequest<T>): Promise<ChatResult<T>> {
    const start = nowMs()
    const deadlineMs = req.deadlineMs ?? opts.deadlineMs ?? DEFAULT_DEADLINE_MS
    const remaining = () => start + deadlineMs - nowMs()

    // The privacy edge: every text a model reads is redacted here, once, before any wire request is built.
    const prepared: PreparedCall = {
      system: redactName(req.system),
      messages: req.messages.map(redactMsg),
      images: (req.images ?? []).map((i) => ({ mime: i.mime, base64: toBase64(i.data) })),
      tools: (req.tools ?? []).map((t) => ({
        name: t.name,
        description: redactName(t.description),
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

    /** The key to try this model with now, or why it is skipped: no key, its key refused, daily budget, cooldown. */
    async function readiness(c: Candidate): Promise<{ key: string } | { skip: FailureReason }> {
      const key = await resolveKey(c.provider.key_env)
      if (!key) return { skip: 'no_key' }
      // Waiting won't fix a refused key, so it is a client failure (quotaOnly stays false), not a cooldown.
      if (keyRefused(c.quotaKey, key, nowMs())) return { skip: 'client' }
      const used = usage.get(`${c.quotaKey}|${days.get(c.quotaKey)}`)
      if (overDailyBudget(c.quota, used, req.priority, config.background_share)) return { skip: 'quota' }
      if (coolingDown(c.quotaKey, nowMs())) return { skip: 'cooldown' }
      return { key }
    }

    /** Time a paid model leaves for the models after it: none unless one of them could be tried now. */
    async function reserveFor(c: Candidate, i: number): Promise<number> {
      if (!c.spec.paid) return 0
      for (const later of candidates.slice(i + 1))
        if ('key' in (await readiness(later)))
          return Math.max(
            MIN_ATTEMPT_MS,
            Math.min(config.paid_fallback_reserve_ms, Math.floor(deadlineMs * RESERVE_SHARE)),
          )
      return 0
    }

    const meta = (c: Candidate) => ({
      provider: c.providerName,
      model: c.spec.model,
      latency_ms: nowMs() - start,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      attempts,
    })

    for (const [i, c] of candidates.entries()) {
      const fail = (reason: FailureReason, status?: number) =>
        failures.push({
          provider: c.providerName,
          model: c.spec.model,
          reason,
          ...(status !== undefined ? { status } : {}),
        })

      const ready = await readiness(c)
      if ('skip' in ready) {
        fail(ready.skip)
        continue
      }
      const { key } = ready
      // Paid first, free when it fails: a paid model stops in time for a later model that could answer to try.
      const reserve = await reserveFor(c, i)

      const adapter = adapters[c.provider.api]
      let messages: Msg[] = prepared.messages
      let retries = 0
      let repaired = false
      let paced = false

      for (;;) {
        // RPM pacing: wait briefly for a token, otherwise move on to the next model.
        const wait = takeRpmToken(c.quotaKey, c.quota.rpm, nowMs())
        if (wait > 0) {
          if (paced || wait > config.retry.max_wait_ms || wait > remaining() - reserve - MIN_ATTEMPT_MS) {
            fail('rate_limited')
            break
          }
          paced = true
          await sleep(wait)
          continue
        }
        paced = false
        if (remaining() < MIN_ATTEMPT_MS) throw new DeadlineError(deadlineMs)
        if (remaining() - reserve < MIN_ATTEMPT_MS) {
          fail('deadline_reserved') // no time for this paid model beside its fallback: go straight to the fallback
          break
        }

        attempts++
        let turn: ModelTurn
        try {
          const wire = adapter.build(c.provider, c.spec, key, { ...prepared, messages })
          turn = adapter.parse(
            c.spec,
            await send(fetchFn, budgets, wire, Math.min(c.spec.timeout_ms, remaining() - reserve), nowMs()),
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
          if (e.reason === 'rate_limited' && e.code !== undefined && OUT_OF_CREDIT.has(e.code)) {
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
          // A refused key: 401, 402, or 403 from a paid model (OpenRouter's free tier answers 403 for moderation
          // blocks, and its quota is shared by two models). Skipped while this same key is set; a new one is tried.
          if (e.status === 401 || e.status === 402 || (e.status === 403 && c.spec.paid)) {
            refuseKey(c.quotaKey, key, nowMs() + AUTH_COOLDOWN_MS)
            fail('client', e.status)
            break
          }
          // A paid model that timed out is not asked again in this call: the time goes to the free models instead.
          if (e.retryable && retries < config.retry.max_retries && !(c.spec.paid && e.reason === 'timeout')) {
            const backoff = e.retryAfterMs ?? config.retry.base_ms * 2 ** retries * (1 + Math.random() * 0.25)
            // A wait that would eat into the fallback's reserve falls through with its real reason and cooldown.
            if (backoff <= config.retry.max_wait_ms && backoff < remaining() - reserve - MIN_ATTEMPT_MS) {
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
          messages = [
            ...messages,
            redactMsg(message),
            { role: 'user', content: redactName(repairInstruction(error)) },
          ]
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
