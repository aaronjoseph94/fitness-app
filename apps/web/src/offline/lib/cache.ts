// Owns: the read cache — the last good response per API query key, so screens still render offline; old entries are pruned.
import { db } from './db'

const MAX_AGE_DAYS = 30

export const responseCache = {
  async read(key: string): Promise<unknown> {
    return (await db.cache.get(key))?.data
  },
  async write(key: string, data: unknown): Promise<void> {
    await db.cache.put({ key, data, updated_at: new Date().toISOString() })
  },
}

export async function pruneCache(): Promise<void> {
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString()
  await db.cache.where('updated_at').below(cutoff).delete()
}
