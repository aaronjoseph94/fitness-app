// Owns: tests at the secrets seam (modules/secrets) — status without values, the user-only rule, an app-stored value
// beating a Worker secret (and env taking over again once it is cleared), and the two readers that depend on it: the
// LLM router runs a model call on the key the app stored when env has none, and /mcp authenticates a token set in the
// app (the Worker secret token stops matching meanwhile).
// Each test owns one secret name, so no test depends on another's leftovers.
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import { createApp } from '../../../app'
import { createDb } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { createLlmRouter, type ProvidersConfig } from '../../llm'
import { clearSecret, listSecrets, resolveSecret, setSecret } from '../index'

const app = createApp()
const db = createDb(env.DB)
const NOW = new Date('2026-10-05T18:00:00.000Z')

const deps = (actor: Deps['actor'] = 'user', workerEnv: Deps['env'] = env): Deps => ({
  db,
  env: workerEnv,
  now: () => NOW,
  actor,
  waitUntil: () => undefined,
})

/** One secret's status, by name. */
async function statusOf(name: string, workerEnv: Deps['env'] = env) {
  const view = await listSecrets(deps('user', workerEnv))
  return view.secrets.find((s) => s.name === name)
}

/** One free-tier provider and model; the tag keeps this file's quota buckets and usage rows apart from other tests. */
function config(tag: string): ProvidersConfig {
  return {
    checked: '2026-10-05',
    background_share: 0.8,
    retry: { max_retries: 0, base_ms: 1, max_wait_ms: 10 },
    providers: { gemini: { api: 'gemini', base_url: 'https://gemini.test/v1beta', key_env: 'GEMINI_API_KEY' } },
    quotas: { [`gemini-${tag}`]: { rpm: 1000, rpd: null, tpm: null, tpd: null, day_tz: 'UTC' } },
    models: {
      'gemini-flash': { provider: 'gemini', model: 'gemini-3.8-flash', quota: `gemini-${tag}`, vision: false, tools: false, json: 'native' },
    },
    chains: { text: ['gemini-flash'], vision: ['gemini-flash'] },
  }
}

describe('secrets', () => {
  it('reports every secret and where its value comes from, and never the value', async () => {
    const fromWorker = { ...env, ZAI_API_KEY: 'zai-from-a-worker-secret' }

    // Not set anywhere.
    expect(await statusOf('USDA_FDC_API_KEY')).toMatchObject({ source: 'none', hint: null, env_set: false, updated_at: null })

    // Set only as a Worker secret: named as such, and not hinted (only what Aaron stored here is hinted).
    expect(await statusOf('ZAI_API_KEY', fromWorker)).toMatchObject({ source: 'env', hint: null, env_set: true })
  })

  it('stores a key, hints its last four characters, and never returns it', async () => {
    const key = 'gsk_a-store-length-key-3456'
    const view = await setSecret(deps(), 'GROQ_API_KEY', key)
    expect(view.secrets.find((s) => s.name === 'GROQ_API_KEY')).toMatchObject({
      source: 'app',
      hint: '3456',
      env_set: false,
      updated_at: NOW.toISOString(),
    })
    // The whole response is safe to hold on to: no secret, and nothing that could be one.
    expect(JSON.stringify(view)).not.toContain(key)
  })

  it('refuses any actor but Aaron', async () => {
    await expect(setSecret(deps('mcp'), 'GROQ_API_KEY', 'gsk_a-key-from-a-tool')).rejects.toMatchObject({ status: 403, code: 'user_only' })
    await expect(clearSecret(deps('ai'), 'GROQ_API_KEY')).rejects.toMatchObject({ status: 403, code: 'user_only' })
  })

  it('prefers the app-stored value over a Worker secret, and falls back to env once cleared', async () => {
    const both = { ...env, OPENROUTER_API_KEY: 'sk-or-from-a-worker-secret' }
    await setSecret(deps('user', both), 'OPENROUTER_API_KEY', 'sk-or-from-the-app-abcdef')
    expect(await resolveSecret(db, both, 'OPENROUTER_API_KEY')).toBe('sk-or-from-the-app-abcdef')

    await clearSecret(deps('user', both), 'OPENROUTER_API_KEY')
    expect(await resolveSecret(db, both, 'OPENROUTER_API_KEY')).toBe('sk-or-from-a-worker-secret')
    expect(await statusOf('OPENROUTER_API_KEY', both)).toMatchObject({ source: 'env' })
  })

  it('runs a model call on the key the app stored when the Worker has none', async () => {
    const stored = 'AIza-a-key-stored-in-the-app'
    await setSecret(deps(), 'GEMINI_API_KEY', stored)
    const noKeys = { ...env, GEMINI_API_KEY: undefined }

    const sent: { url: string; key: string | undefined }[] = []
    const fetch = async (url: string, init: RequestInit) => {
      sent.push({ url, key: (init.headers as Record<string, string>)['x-goog-api-key'] })
      return Response.json({
        candidates: [{ content: { role: 'model', parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' }],
        usageMetadata: {},
      })
    }

    const llm = createLlmRouter(deps('ai', noKeys), { fetch, config: config('secrets') })
    const result = await llm.complete({
      job: 'meal_analysis',
      priority: 'user',
      system: 'You parse meals.',
      messages: [{ role: 'user', content: 'two eggs' }],
      schema: z.object({ ok: z.boolean() }),
    })

    expect(result.data).toEqual({ ok: true })
    expect(sent).toHaveLength(1)
    expect(sent[0]!.key).toBe(stored)
  })

  it('authenticates /mcp with a token set in the app, and stops accepting the Worker secret one', async () => {
    const stored = `app-mcp-${'x'.repeat(24)}`
    await setSecret(deps(), 'MCP_BEARER_TOKEN', stored)
    const noBypass = { ...env, DEV_AUTH_BYPASS: undefined }
    const initialize = (bearer: string) =>
      app.request(
        'https://fitness.example.workers.dev/mcp',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${bearer}`,
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            'MCP-Protocol-Version': '2025-06-18',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'vitest', version: '1' } },
          }),
        },
        noBypass,
      )

    const accepted = await initialize(stored)
    expect(accepted.status, await accepted.clone().text()).toBe(200)

    // The stored token wins over the Worker secret: the old one is no longer a way in.
    const rejected = await initialize('test-mcp-token')
    expect(rejected.status).toBe(401)
  })
})
