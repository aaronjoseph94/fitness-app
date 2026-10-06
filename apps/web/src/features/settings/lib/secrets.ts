// Owns: what each runtime secret is (pure) — its label, what it unlocks, where Aaron gets one, the prefix its provider
// uses so a pasted value can be sanity-checked, and how a stored secret reads back. Never a value: the API returns
// status only, so nothing here can put a key on screen that the Worker would not have sent.
import { LLM_SECRET_NAMES, type SecretName, type SecretStatus } from '@fitness/shared/schemas'

export interface SecretField {
  name: SecretName
  label: string
  /** What this key turns on in the app, in plain words. */
  help: string
  /** Where to get one (a short instruction, not a link title). */
  where: string
  url: string
  /** The prefix the provider uses; a pasted value that does not start with it is worth a second look. */
  prefix?: string
  /** Generated here rather than fetched from a provider (the MCP bearer token). */
  generated?: boolean
}

export const SECRET_FIELDS: Record<SecretName, SecretField> = {
  GEMINI_API_KEY: {
    name: 'GEMINI_API_KEY',
    label: 'Google Gemini',
    help: 'The primary model. Parses every log, reads meal photos, reforecasts nightly. Without it the AI paths run engine-only.',
    where: 'Google AI Studio → Get API key (free tier)',
    url: 'https://aistudio.google.com/apikey',
    prefix: 'AIza',
  },
  ZAI_API_KEY: {
    name: 'ZAI_API_KEY',
    label: 'Z.ai (GLM)',
    help: 'The first fallback when Gemini is out of free quota.',
    where: 'z.ai → API keys (the Flash models are free)',
    url: 'https://z.ai/manage-apikey/apikey-list',
  },
  OPENROUTER_API_KEY: {
    name: 'OPENROUTER_API_KEY',
    label: 'OpenRouter',
    help: 'Free “:free” models as a second fallback: 50 requests a day, 1,000 after a one-time $10 top-up.',
    where: 'openrouter.ai → Keys',
    url: 'https://openrouter.ai/settings/keys',
    prefix: 'sk-or-',
  },
  GROQ_API_KEY: {
    name: 'GROQ_API_KEY',
    label: 'Groq',
    help: 'The last text fallback; fast, with a generous daily limit.',
    where: 'console.groq.com → API keys',
    url: 'https://console.groq.com/keys',
    prefix: 'gsk_',
  },
  USDA_FDC_API_KEY: {
    name: 'USDA_FDC_API_KEY',
    label: 'USDA FoodData Central',
    help: 'Generic foods (USDA) when a barcode or a search is not already in our own tables.',
    where: 'api.data.gov → sign up (free, instant)',
    url: 'https://api.data.gov/signup',
  },
  MCP_BEARER_TOKEN: {
    name: 'MCP_BEARER_TOKEN',
    label: 'Claude connector token',
    help: 'The password Claude sends with every request. Generate one here and paste it into the connector; it never appears again after you leave this screen.',
    where: 'Generated here by tapping the row',
    url: '',
    generated: true,
  },
  HEALTH_WEBHOOK_TOKEN: {
    name: 'HEALTH_WEBHOOK_TOKEN',
    label: 'Apple Watch shortcut token',
    help: 'Lets your iOS Shortcut post steps and sleep to /api/ingest/health without signing in.',
    where: 'Generated here by tapping the row',
    url: '',
    generated: true,
  },
}

/** The provider keys in router chain order, then the food key; the order the Models section lists them in. */
export const MODEL_SECRET_NAMES: readonly SecretName[] = [...LLM_SECRET_NAMES, 'USDA_FDC_API_KEY']

/** "Set here · ends 4f2a" / "Set as a Worker secret" / "Not set" — never the value itself. */
export function sourceLabel(status: SecretStatus): string {
  if (status.source === 'app') return status.hint ? `Set here · ends ${status.hint}` : 'Set here'
  if (status.source === 'env') return 'Set as a Worker secret'
  return 'Not set'
}

/** True when this secret is configured anywhere (the app or a Worker secret). */
export function isConfigured(status: SecretStatus | undefined): boolean {
  return status !== undefined && status.source !== 'none'
}

/** What is wrong with a pasted value: `problem` stops the save, `warning` only asks Aaron to look again. */
export interface SecretCheck {
  problem: string | null
  warning: string | null
}

/**
 * Check a pasted value before saving it. An empty field is not a problem — Save simply stays disabled until there is
 * something to check, so opening the dialog never greets Aaron with an error. A prefix that does not match is a
 * warning, not a wall: providers change them.
 */
export function checkSecret(field: SecretField, value: string): SecretCheck {
  const trimmed = value.trim()
  if (trimmed.length === 0) return { problem: null, warning: null }
  if (trimmed.length < 8) return { problem: 'That is too short to be a key.', warning: null }
  if (trimmed.length > 4096) return { problem: 'That is far longer than any key.', warning: null }
  if (field.prefix && !trimmed.startsWith(field.prefix))
    return { problem: null, warning: `Usually starts with ${field.prefix} — check the whole key was copied.` }
  return { problem: null, warning: null }
}

/** A fresh token for the generated secrets: 32 random bytes, base64url (43 characters, no padding). */
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}
