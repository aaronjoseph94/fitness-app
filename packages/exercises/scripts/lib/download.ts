// Owns: the download helpers the fetch scripts share — fetch with retries, "already on disk" check, a bounded worker pool.
import { stat } from 'node:fs/promises'

const RETRIES = 3

/** GET `url` as bytes; up to 3 attempts with a 30 s timeout each and a short linear back-off. */
export async function download(url: string): Promise<Uint8Array> {
  let lastError: unknown
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      return new Uint8Array(await res.arrayBuffer())
    } catch (error) {
      lastError = error
      await new Promise((r) => setTimeout(r, 500 * attempt))
    }
  }
  throw lastError
}

/** True when `file` exists and is not empty (a previous run finished writing it). */
export async function exists(file: string): Promise<boolean> {
  try {
    return (await stat(file)).size > 0
  } catch {
    return false
  }
}

/** Runs `worker` over `items` with at most `limit` in flight. */
export async function pool<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await worker(items[next++] as T)
  })
  await Promise.all(lanes)
}
