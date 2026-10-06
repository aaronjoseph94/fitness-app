// Owns: where the LLM router gets a provider key — the value Aaron stored in the app first, the matching Worker secret
// second, so `wrangler secret put` keeps working (docs/DEPLOY.md §5). The stored values are read once per router and
// never logged: a missing key is a `no_key` failure, not an error.
import type { SecretName } from '@fitness/shared/schemas'
import type { Deps } from '../../../lib/deps'
import { loadSecretValues } from '../../secrets'

/** One provider key; undefined when no key is configured in the app or in env. Lookups are served from a cached map. */
export type KeyResolver = (name: SecretName) => Promise<string | undefined>

export function createKeyResolver(deps: Deps): KeyResolver {
  let stored: Promise<Map<string, string>> | undefined
  return async (name) => {
    // A read that fails (a migration not applied yet) must not break a call that has a Worker secret to fall back on.
    stored ??= loadSecretValues(deps).catch((err: unknown) => {
      console.warn(JSON.stringify({ at: 'llm', event: 'secrets_read_failed', error: err instanceof Error ? err.message : String(err) }))
      return new Map<string, string>()
    })
    return (await stored).get(name) ?? deps.env[name]
  }
}
