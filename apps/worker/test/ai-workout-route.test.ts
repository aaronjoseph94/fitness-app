// Owns: the test at the AI workout route — POST /api/ai/workout, as the app (Aaron), with no model key refuses with
// 409 no_model_key before anything is queued (UX review #14: the client then shows the one "add a model key" message).
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { ai_jobs, createDb } from '../src/db'
import type { Env } from '../src/env'

const app = createApp()
const db = createDb(env.DB)

/** Every provider key unset (app_secrets is empty too), so no model can answer. */
const MODEL_KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_PAID_API_KEY',
  'GEMINI_API_KEY',
  'ZAI_API_KEY',
  'OPENROUTER_API_KEY',
  'GROQ_API_KEY',
] as const
const noKeys: Env = { ...env, ...Object.fromEntries(MODEL_KEYS.map((k) => [k, undefined])) }

const post = (body: unknown) =>
  app.request(
    'http://localhost/api/ai/workout',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    noKeys,
  )

describe('POST /api/ai/workout', () => {
  it('with no model key: 409 no_model_key, and no ai_jobs row', async () => {
    const res = await post({ mode: 'generate', date: '2026-10-23' })

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'no_model_key' })
    expect(await db.select().from(ai_jobs)).toEqual([])
  })
})
