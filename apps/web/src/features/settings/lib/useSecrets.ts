// Owns: reading and writing the runtime secrets from the app — GET /api/settings/secrets and the MCP connection view,
// plus the two writes (set, clear). Secrets are not queued offline (the endpoints have offline: 'never'): a key is set
// once, on a connection, and the response carries no value to cache.
import { endpoints } from '@fitness/shared/api'
import type { SecretName } from '@fitness/shared/schemas'
import { useApiMutation, useApiQuery } from '../../../api'

/** Every secret with its status (name, source, hint) — never a value. */
export function useSecrets() {
  return useApiQuery(endpoints.settings.secrets, {})
}

/** How Claude connects: the connector URL, the discovery URLs and the token's status. */
export function useConnection() {
  return useApiQuery(endpoints.settings.connection, {})
}

/** Settings pages that show whether AI is set up read the same two queries. */
export const SECRET_QUERY_ENDPOINTS = [endpoints.settings.secrets, endpoints.settings.connection] as const

export function useSecretMutations() {
  const invalidates = [...SECRET_QUERY_ENDPOINTS, endpoints.settings.get]
  const set = useApiMutation(endpoints.settings.setSecret, { invalidates })
  const clear = useApiMutation(endpoints.settings.clearSecret, { invalidates })
  return {
    set,
    clear,
    saving: set.isPending || clear.isPending,
    /** Store a key; resolves when the Worker has it, rejects (ApiError) otherwise. */
    save: (name: SecretName, value: string) => set.mutateAsync({ params: { name }, body: { value } }),
    /** Forget the app-stored value (a Worker secret of the same name still applies). */
    remove: (name: SecretName) => clear.mutateAsync({ params: { name } }),
  }
}
