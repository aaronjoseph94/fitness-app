// Owns: the settings feature's model-chain entry point — which model the router tries first, read from the stored key
// statuses (never a value): a paid key leads in the router's order (Claude → ChatGPT → Gemini Pro), else the free tiers
// (Groq → OpenRouter → Z.ai → Gemini); plus how many model keys are set. Ask AI's eyebrow and Settings' "Model keys"
// row read it, so both say what Settings → AI shows.
import type { SecretStatus } from '@fitness/shared/schemas'
import { isConfigured, MODEL_SECRET_NAMES, PAID_SECRET_NAMES, SECRET_FIELDS } from './lib/secrets'
import { useSecrets } from './lib/useSecrets'

/** The paid models by key, as Settings → AI names them. */
const PAID_MODEL: Record<(typeof PAID_SECRET_NAMES)[number], string> = {
  ANTHROPIC_API_KEY: 'Claude Opus 5.5',
  OPENAI_API_KEY: 'GPT-6.1 Sol',
  GEMINI_PAID_API_KEY: 'Gemini 3.1 Pro',
}

export interface ModelChain {
  /** What answers first: a paid model's name, else a free provider's label; null with no model key at all. */
  first: string | null
  /** The first one is a paid key. */
  paid: boolean
  /** How many model keys (paid and free) are set, here or as Worker secrets. */
  keys: number
}

/** The chain's head and the key count, from the secrets' statuses (pure). */
export function modelChain(statuses: readonly SecretStatus[]): ModelChain {
  const set = (name: string) => isConfigured(statuses.find((s) => s.name === name))
  const paid = PAID_SECRET_NAMES.filter(set)
  const free = MODEL_SECRET_NAMES.filter(set)
  const first = paid[0] ? PAID_MODEL[paid[0]] : free[0] ? SECRET_FIELDS[free[0]].label : null
  return { first, paid: paid.length > 0, keys: paid.length + free.length }
}

/** The model chain once the key statuses have loaded; undefined while they load or when they can't be read. */
export function useModelChain(): ModelChain | undefined {
  const secrets = useSecrets()
  return secrets.data ? modelChain(secrets.data.secrets) : undefined
}
