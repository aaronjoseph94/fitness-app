// Owns: reading and writing `app_secrets` — the upsert, the delete, the one-value read, and the status list that never
// carries a value. Every reader in the Worker goes through here, so the app-stored value always beats the Worker secret
// of the same name.
import type { SecretName, SecretStatus } from '@fitness/shared/schemas'
import { eq } from 'drizzle-orm'
import { app_secrets, type Db } from '../../../db'
import type { Env } from '../../../env'

/** Characters kept as a hint: enough to recognise which key is stored, not enough to use it. */
const HINT_CHARS = 4
/** Shorter than this and a hint would give away most of the value. */
const HINT_MIN_LENGTH = 12

export interface StoredSecret {
  name: string
  value: string
  updated_at: string
}

/** Every app-stored secret (name sorted, so a view is stable) in one query. */
export async function readStored(db: Db): Promise<StoredSecret[]> {
  return db
    .select({ name: app_secrets.name, value: app_secrets.value, updated_at: app_secrets.updated_at })
    .from(app_secrets)
    .orderBy(app_secrets.name)
}

/** One app-stored value, or undefined when the app has never stored this name. */
export async function storedSecret(db: Db, name: SecretName): Promise<string | undefined> {
  const [row] = await db.select({ value: app_secrets.value }).from(app_secrets).where(eq(app_secrets.name, name)).limit(1)
  return row?.value
}

/** Store (or replace) one secret. `name` is unique, so this is one row per secret. */
export async function upsertSecret(db: Db, name: SecretName, value: string, now: string): Promise<void> {
  await db
    .insert(app_secrets)
    .values({ name, value, created_at: now, updated_at: now })
    .onConflictDoUpdate({ target: app_secrets.name, set: { value, updated_at: now } })
}

/** Forget one secret; a no-op when it was never stored. */
export async function deleteSecret(db: Db, name: SecretName): Promise<void> {
  await db.delete(app_secrets).where(eq(app_secrets.name, name))
}

/** The Worker secret of this name, when one is set in env (wrangler / dashboard). */
export function envValue(env: Env, name: SecretName): string | undefined {
  return env[name]
}

/** Last 4 characters of a stored value, or null when it is too short to hint from safely. */
export function hintFor(value: string): string | null {
  return value.length >= HINT_MIN_LENGTH ? value.slice(-HINT_CHARS) : null
}

/** One secret's status: stored in the app, only as a Worker secret, or not set at all. */
export function statusFor(name: SecretName, stored: Map<string, StoredSecret>, env: Env): SecretStatus {
  const row = stored.get(name)
  const fromEnv = envValue(env, name)
  return {
    name,
    source: row ? 'app' : fromEnv ? 'env' : 'none',
    hint: row ? hintFor(row.value) : null,
    env_set: Boolean(fromEnv),
    updated_at: row ? row.updated_at : null,
  }
}
