// Owns: the shape of providers.json (Zod), parsing it once per isolate, and choosing the models for one call
// (chain by job kind, then filtered by capability: vision calls never reach a text-only model).
import type { JobType } from '@fitness/shared/schemas'
import * as z from 'zod'
import raw from '../providers.json'

const Count = z.number().int().positive()

const ProviderSpec = z.object({
  api: z.enum(['gemini', 'openai', 'anthropic']),
  base_url: z.url(),
  key_env: z.enum([
    'GEMINI_API_KEY',
    'ZAI_API_KEY',
    'OPENROUTER_API_KEY',
    'GROQ_API_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GEMINI_PAID_API_KEY',
  ]),
  headers: z.record(z.string(), z.string()).optional(),
  /** The output-cap key of an OpenAI-compatible body: OpenAI's own reasoning models reject `max_tokens`. */
  max_tokens_param: z.enum(['max_tokens', 'max_completion_tokens']).default('max_tokens'),
})
export type ProviderSpec = z.infer<typeof ProviderSpec>

/** One quota bucket. A model points at one; several models can share one (OpenRouter's :free daily cap). */
const QuotaSpec = z.object({
  rpm: Count,
  rpd: Count.nullable(),
  tpm: Count.nullable(),
  /** Tokens per day (in + out); the daily guard applies it like rpd. */
  tpd: Count.nullable(),
  /** The timezone whose midnight resets the daily quota (Gemini: Pacific). */
  day_tz: z.string().default('UTC'),
})
export type QuotaSpec = z.infer<typeof QuotaSpec>

const ModelSpec = z.object({
  provider: z.string(),
  model: z.string(),
  quota: z.string(),
  vision: z.boolean(),
  tools: z.boolean(),
  /** native: Gemini responseJsonSchema; json_schema / json_object: OpenAI response_format; prompt: schema in the system prompt only. */
  json: z.enum(['native', 'json_schema', 'json_object', 'prompt']),
  /** Provider-specific request params merged into generationConfig (Gemini) or the body (OpenAI-compatible, Anthropic). */
  params: z.record(z.string(), z.json()).optional(),
  timeout_ms: Count.default(20_000),
  /** Pay-as-you-go (SPEC §9 "Paid models"): tried first when its key is set, capped by its own quota's rpd. */
  paid: z.boolean().default(false),
})
export type ModelSpec = z.infer<typeof ModelSpec>

export const ProvidersConfig = z
  .object({
    checked: z.iso.date(),
    /** Share of a daily quota background jobs may use. */
    background_share: z.number().gt(0).max(1),
    retry: z.object({ max_retries: z.number().int().min(0).max(3), base_ms: Count, max_wait_ms: Count }),
    providers: z.record(z.string(), ProviderSpec),
    quotas: z.record(z.string(), QuotaSpec),
    models: z.record(z.string(), ModelSpec),
    /** Ordered model keys per chain: `text`, `vision`, or a job type that needs its own order. */
    chains: z
      .record(z.string(), z.array(z.string()).min(1))
      .refine((c) => !!c.text && !!c.vision, 'chains needs text and vision'),
  })
  .superRefine((c, ctx) => {
    for (const [key, m] of Object.entries(c.models)) {
      if (!c.providers[m.provider])
        ctx.addIssue({
          code: 'custom',
          path: ['models', key, 'provider'],
          message: `unknown provider ${m.provider}`,
        })
      if (!c.quotas[m.quota])
        ctx.addIssue({ code: 'custom', path: ['models', key, 'quota'], message: `unknown quota ${m.quota}` })
    }
    for (const [name, keys] of Object.entries(c.chains))
      for (const k of keys)
        if (!c.models[k])
          ctx.addIssue({ code: 'custom', path: ['chains', name], message: `unknown model ${k}` })
  })
export type ProvidersConfig = z.infer<typeof ProvidersConfig>
export type ProvidersConfigInput = z.input<typeof ProvidersConfig>

/** providers.json, validated once per isolate. */
export const defaultConfig: ProvidersConfig = ProvidersConfig.parse(raw)

/** A model ready to try: its key in the config plus its provider and quota. */
export interface Candidate {
  key: string
  spec: ModelSpec
  provider: ProviderSpec
  providerName: string
  quotaKey: string
  quota: QuotaSpec
}

/** The models to try, in order. A job-specific chain wins; capability filters always apply. */
export function candidatesFor(
  config: ProvidersConfig,
  job: JobType,
  needs: { vision: boolean; tools: boolean },
): Candidate[] {
  const keys = config.chains[job] ?? config.chains[needs.vision ? 'vision' : 'text'] ?? []
  const out: Candidate[] = []
  for (const key of keys) {
    const spec = config.models[key]!
    if (needs.vision && !spec.vision) continue
    if (needs.tools && !spec.tools) continue
    out.push({
      key,
      spec,
      provider: config.providers[spec.provider]!,
      providerName: spec.provider,
      quotaKey: spec.quota,
      quota: config.quotas[spec.quota]!,
    })
  }
  return out
}
