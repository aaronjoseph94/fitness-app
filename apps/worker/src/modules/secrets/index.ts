// Owns: the secrets module's interface — what the app may know about the Worker's runtime secrets, and how they are
// set. Secrets are write-only: nothing here returns a value, because a response is cached for offline reads by the PWA
// (api/lib/query.ts writes every response into Dexie) and would otherwise end up on disk in the browser.
//
// Who reads the values:
//   - the LLM router (the provider keys, app value first then the Worker secret) — modules/llm/lib/keys.ts
//   - the MCP auth middleware (`MCP_BEARER_TOKEN`) — middleware/mcp-auth.ts
//   - the food sources adapter (`USDA_FDC_API_KEY`) — modules/food-sources
// `wrangler secret put` keeps working: a Worker secret is used whenever the app has not stored that name, and a stored
// value takes precedence over one that is.
//
// Setting or clearing a secret is logged as one `change` event carrying the NAME and the action only, never the value.
import { today } from '@fitness/shared/engine'
import { SecretName, type SecretsView } from '@fitness/shared/schemas'
import type { Db } from '../../db'
import type { Env } from '../../env'
import type { Deps } from '../../lib/deps'
import { badRequest, HttpError } from '../../lib/http-error'
import { recordEvent } from '../events'
import { deleteSecret, envValue, readStored, statusFor, storedSecret, upsertSecret, type StoredSecret } from './lib/store'

/** Shortest value worth storing; a provider key or a token is far longer. */
const MIN_LENGTH = 8

/** Every secret with its status (GET /api/settings/secrets). */
export async function listSecrets(deps: Deps): Promise<SecretsView> {
  const stored = new Map((await readStored(deps.db)).map((row) => [row.name, row]))
  return view(deps.env, stored)
}

/** Every app-stored secret as name → value, for a reader that needs several (the LLM router's chain). */
export async function loadSecretValues(deps: Deps): Promise<Map<string, string>> {
  const rows = await readStored(deps.db)
  return new Map(rows.map((row) => [row.name, row.value]))
}

/**
 * One secret's value: the app-stored value wins, else the Worker secret. For readers with no `Deps` (the MCP auth
 * middleware's token validator has only the binding), which build a db from what they hold.
 */
export async function resolveSecret(db: Db, env: Env, name: SecretName): Promise<string | undefined> {
  return (await storedSecret(db, name)) ?? envValue(env, name)
}

/** Store one secret (PUT /api/settings/secrets/:name). 403 for anything but Aaron; the value is never logged. */
export async function setSecret(deps: Deps, name: SecretName, value: string): Promise<SecretsView> {
  assertUser(deps)
  const trimmed = value.trim()
  if (trimmed.length < MIN_LENGTH) throw badRequest(`${name} is too short to be a key (at least ${MIN_LENGTH} characters)`)
  const now = deps.now().toISOString()
  await upsertSecret(deps.db, name, trimmed, now)
  await logChange(deps, name, 'set')
  return listSecrets(deps)
}

/** Forget the app-stored secret (DELETE /api/settings/secrets/:name); a Worker secret still applies afterwards. */
export async function clearSecret(deps: Deps, name: SecretName): Promise<SecretsView> {
  assertUser(deps)
  await deleteSecret(deps.db, name)
  await logChange(deps, name, 'cleared')
  return listSecrets(deps)
}

function view(env: Env, stored: Map<string, StoredSecret>): SecretsView {
  // SecretName.options, not the stored rows: every secret is listed, whether or not it is set.
  return { secrets: SecretName.options.map((name) => statusFor(name, stored, env)) }
}

/** Secrets reach the AI, so no actor but Aaron may change one — the same rail that guards the settings themselves. */
function assertUser(deps: Deps): void {
  if (deps.actor !== 'user')
    throw new HttpError(403, 'user_only', 'Only Aaron changes secrets: they are read by the AI router and the MCP connector')
}

/** One `change` event per edit: the name and the action, so the dashboard shows what moved without storing a value. */
async function logChange(deps: Deps, name: SecretName, action: 'set' | 'cleared'): Promise<void> {
  await recordEvent(deps, {
    kind: 'change',
    date: today(deps.now()),
    summary: `Secret ${name} ${action}`,
    body: { entity: 'secret', changes: [{ path: name, from: action === 'set' ? null : 'set', to: action === 'set' ? 'set' : null }] },
  })
}
