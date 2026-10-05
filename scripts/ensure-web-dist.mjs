// Owns: making sure apps/web/dist exists so `wrangler dev` (whose assets dir is ../web/dist) can start before the first web build.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
const dir = new URL('../apps/web/dist/', import.meta.url)
if (!existsSync(new URL('index.html', dir))) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(new URL('index.html', dir), '<!doctype html><title>Fitness</title><p>Run <code>pnpm build</code> or use the Vite dev server on :5173.</p>')
}
