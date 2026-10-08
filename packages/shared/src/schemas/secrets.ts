// Owns: the runtime secrets the Worker reads — the LLM provider keys, the MCP bearer token and the ingest webhook
// token — plus how they are reported back to the app. Secrets are write-only: the API returns whether one is set, where
// its value came from and a short hint, never the value itself, so no secret can reach the web bundle (SPEC §4).
import * as z from 'zod'
import { Instant } from './common'

/** Every secret the app can store, named exactly as the Worker secret (SPEC §4, docs/DEPLOY.md). */
export const SecretName = z.enum([
  'GEMINI_API_KEY',
  'ZAI_API_KEY',
  'OPENROUTER_API_KEY',
  'GROQ_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_PAID_API_KEY',
  'USDA_FDC_API_KEY',
  'MCP_BEARER_TOKEN',
  'HEALTH_WEBHOOK_TOKEN',
])
export type SecretName = z.infer<typeof SecretName>

/**
 * The LLM provider keys (SPEC §9). The router's chain order is data in the Worker's providers.json (paid models first
 * when their key is set, then Groq → OpenRouter → Gemini last). This array is the name set only — Settings UI order
 * lives in apps/web secrets.ts.
 */
export const LLM_SECRET_NAMES = [
  'GEMINI_API_KEY',
  'ZAI_API_KEY',
  'OPENROUTER_API_KEY',
  'GROQ_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_PAID_API_KEY',
] as const satisfies readonly SecretName[]

/**
 * The pay-as-you-go keys (SPEC §9 "Paid models"), in the order the router tries them: Claude (Anthropic), ChatGPT
 * (OpenAI), Gemini Pro. Google issues one key for both tiers, so the Pro model has its own name: setting it is the
 * opt-in (a free-only key would make every call fail over through a billing error first).
 */
export const PAID_SECRET_NAMES = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_PAID_API_KEY'] as const satisfies readonly SecretName[]

/** Where a configured secret's value comes from: stored by the app, or a Worker secret (wrangler / dashboard). */
export const SecretSource = z.enum(['app', 'env', 'none'])
export type SecretSource = z.infer<typeof SecretSource>

/**
 * One secret as the API reports it. Never the value: `hint` is the last 4 characters, or null when the value is too
 * short to hint from. `env_set` says a Worker secret with the same name also exists; the stored value (source 'app')
 * takes precedence over it.
 */
export const SecretStatus = z.object({
  name: SecretName,
  source: SecretSource,
  hint: z.string().nullable(),
  env_set: z.boolean(),
  updated_at: Instant.nullable(),
})
export type SecretStatus = z.infer<typeof SecretStatus>

/** Response of GET/PUT/DELETE /api/settings/secrets. */
export const SecretsView = z.object({ secrets: z.array(SecretStatus) })
export type SecretsView = z.infer<typeof SecretsView>

/** Body of PUT /api/settings/secrets/:name: the value, trimmed (use DELETE to forget one, not an empty string). */
export const SecretSet = z.object({ value: z.string().trim().min(8).max(4096) })
export type SecretSet = z.infer<typeof SecretSet>

/**
 * How Claude reaches the app (SPEC §8 "MCP connector"): the URL to paste into Claude's custom-connector field, the
 * discovery URLs its client probes, and whether a bearer token is configured. `last_write_at` is the newest MCP write
 * (`ai_events` with actor 'mcp') — evidence the connector has actually been used.
 */
export const McpConnectionView = z.object({
  mcp_url: z.url(),
  authorization_server_url: z.url(),
  protected_resource_url: z.url(),
  bearer_configured: z.boolean(),
  bearer_source: SecretSource,
  last_write_at: Instant.nullable(),
})
export type McpConnectionView = z.infer<typeof McpConnectionView>
