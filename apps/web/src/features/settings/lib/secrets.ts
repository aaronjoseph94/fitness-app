// Owns: what each runtime secret is (pure) — its label, what it unlocks, where Aaron gets one, the prefix its provider
// uses so a pasted value can be sanity-checked, and how a stored secret reads back. Two lists feed the AI page: the paid
// models (Claude → ChatGPT → Gemini Pro; a set key puts that model first in every chain) and the free tiers in the
// router's chain order (Groq → OpenRouter → Gemini last). Never a value: the API returns status only, so nothing here
// can put a key on screen that the Worker would not have sent.
import type { SecretName, SecretStatus } from '@fitness/shared/schemas'

/** The paid keys in the router's order (Claude → ChatGPT → Gemini Pro); the shared schema owns the list. */
export { PAID_SECRET_NAMES } from '@fitness/shared/schemas'

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
  ANTHROPIC_API_KEY: {
    name: 'ANTHROPIC_API_KEY',
    label: 'Claude (Anthropic)',
    help: 'Claude Opus 5.5 answers first for everything the AI does — about $4 per million words in and $20 out. Pay as you go; a Claude Pro subscription does not include this.',
    where: 'console.anthropic.com → API keys',
    url: 'https://console.anthropic.com/settings/keys',
    prefix: 'sk-ant-',
  },
  OPENAI_API_KEY: {
    name: 'OPENAI_API_KEY',
    label: 'ChatGPT (OpenAI)',
    help: 'GPT-6.1 Sol, tried after Claude — about $2 per million words in and $10 out. Pay as you go; a ChatGPT Plus subscription does not include this.',
    where: 'platform.openai.com → API keys',
    url: 'https://platform.openai.com/api-keys',
    prefix: 'sk-',
  },
  GEMINI_PAID_API_KEY: {
    name: 'GEMINI_PAID_API_KEY',
    label: 'Gemini Pro (Google)',
    help: 'Gemini 3.1 Pro, tried after ChatGPT — about $2 per million words in and $12 out. The same Google key as the free row, with billing turned on in AI Studio; pasting it here is what turns Pro on.',
    where: 'Google AI Studio → Get API key, then turn on billing',
    url: 'https://aistudio.google.com/apikey',
    prefix: 'AIza',
  },
  GROQ_API_KEY: {
    name: 'GROQ_API_KEY',
    label: 'Groq',
    help: 'The primary text model: fast, with a generous daily limit. Used first for meal parsing and Ask AI.',
    where: 'console.groq.com → API keys',
    url: 'https://console.groq.com/keys',
    prefix: 'gsk_',
  },
  OPENROUTER_API_KEY: {
    name: 'OPENROUTER_API_KEY',
    label: 'OpenRouter',
    help: 'Second choice for text, and the primary for photos and scan sheets. Free “:free” models: 50 requests a day.',
    where: 'openrouter.ai → Keys',
    url: 'https://openrouter.ai/settings/keys',
    prefix: 'sk-or-',
  },
  ZAI_API_KEY: {
    name: 'ZAI_API_KEY',
    label: 'Z.ai (GLM)',
    help: 'Extra fallback between OpenRouter and Gemini when those are busy or out of free quota.',
    where: 'z.ai → API keys (the Flash models are free)',
    url: 'https://z.ai/manage-apikey/apikey-list',
  },
  GEMINI_API_KEY: {
    name: 'GEMINI_API_KEY',
    label: 'Google Gemini',
    help: 'Last resort for text and a vision fallback after OpenRouter.',
    where: 'Google AI Studio → Get API key (free tier)',
    url: 'https://aistudio.google.com/apikey',
    prefix: 'AIza',
  },
  USDA_FDC_API_KEY: {
    name: 'USDA_FDC_API_KEY',
    label: 'USDA FoodData Central',
    // Food matching is Canadian (CNF) and Open Food Facts only; the field stays so the name set is complete.
    help: 'No longer used: food matching reads the Canadian Nutrient File and Open Food Facts.',
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

/**
 * The free provider keys the Models section offers, in the router's chain order (Groq → OpenRouter → Gemini last;
 * providers.json is the source of truth). Any paid key (PAID_SECRET_NAMES above) is tried ahead of all of these. The
 * food key used to be listed here and is retired: food matching is Canadian now.
 */
export const MODEL_SECRET_NAMES: readonly SecretName[] = ['GROQ_API_KEY', 'OPENROUTER_API_KEY', 'ZAI_API_KEY', 'GEMINI_API_KEY']

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
