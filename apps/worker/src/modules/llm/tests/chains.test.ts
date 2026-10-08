// Owns: the shipped chain order in providers.json — the paid models lead both chains (Claude → ChatGPT → Gemini Pro,
// SPEC §9, 2026-10-08) under their own 200/day cost cap, then the free tiers: text is Groq → OpenRouter → Gemini
// last (Aaron, 2026-10-06); vision has no Groq model, so OpenRouter leads and Gemini stays last. Pure: no fetch, no
// key, no database; the router's own behaviour is covered by ./router.test.ts with its own config.
import { PAID_SECRET_NAMES } from '@fitness/shared/schemas'
import { describe, expect, it } from 'vitest'
import { candidatesFor, defaultConfig } from '../lib/config'

type Chain = 'text' | 'vision'

/** Our cost rail: a paid model may never be allowed more requests per day than this. */
const PAID_RPD_CAP = 300
/** waitUntil allows 30 s; the router's default deadline is 25 s. */
const MAX_TIMEOUT_MS = 25_000

const chain = (name: Chain) => defaultConfig.chains[name]!
const modelOf = (key: string) => defaultConfig.models[key]!
/** The provider names of a chain, in the order the router would try them. */
const providersOf = (name: Chain) => chain(name).map((key) => modelOf(key).provider)
/** The provider names of the free part of a chain, in order. */
const freeProvidersOf = (name: Chain) =>
  chain(name)
    .filter((key) => !modelOf(key).paid)
    .map((key) => modelOf(key).provider)

describe('provider chains', () => {
  it('leads both chains with the paid models, Claude → ChatGPT → Gemini Pro, before every free model', () => {
    for (const name of ['text', 'vision'] as const) {
      const keys = chain(name)
      const paid = keys.filter((key) => modelOf(key).paid)
      expect(paid.map((key) => modelOf(key).provider)).toEqual(['anthropic', 'openai', 'gemini-paid'])
      expect(keys.slice(0, paid.length)).toEqual(paid)
      for (const key of paid) expect(modelOf(key)).toMatchObject({ vision: true, tools: true })
    }
  })

  it('tries Groq first among the free text models, then OpenRouter, with Gemini last', () => {
    const order = freeProvidersOf('text')
    const first = chain('text').find((key) => !modelOf(key).paid)!
    expect(modelOf(first).provider).toBe('groq')
    expect(defaultConfig.providers.groq!.key_env).toBe('GROQ_API_KEY')
    expect(modelOf(first).tools).toBe(true)
    expect(order.indexOf('groq')).toBe(0)
    expect(order.indexOf('openrouter')).toBeGreaterThan(order.indexOf('groq'))
    expect(order.indexOf('gemini')).toBeGreaterThan(order.indexOf('openrouter'))
    expect(order[order.length - 1]).toBe('gemini')
    expect(providersOf('text').at(-1)).toBe('gemini')
  })

  it('leads free vision with OpenRouter (no Groq vision model) and keeps Gemini last', () => {
    const order = freeProvidersOf('vision')
    expect(order[0]).toBe('openrouter')
    expect(order).toContain('gemini')
    expect(order[order.length - 1]).toBe('gemini')
    for (const key of chain('vision')) expect(modelOf(key).vision).toBe(true)
  })

  it('caps every paid model at our daily cost rail and under the router deadline', () => {
    const paid = Object.entries(defaultConfig.models).filter(([, m]) => m.paid)
    expect(paid.length).toBeGreaterThanOrEqual(3)
    for (const [key, m] of paid) {
      const quota = defaultConfig.quotas[m.quota]!
      expect(quota.rpd, `${key} rpd`).not.toBeNull()
      expect(quota.rpd!, `${key} rpd`).toBeLessThanOrEqual(PAID_RPD_CAP)
      expect(m.timeout_ms, `${key} timeout`).toBeLessThanOrEqual(MAX_TIMEOUT_MS)
    }
  })

  it('reads the paid keys under the names the app stores them as, in the same order', () => {
    const keyEnvs = chain('text')
      .filter((key) => modelOf(key).paid)
      .map((key) => defaultConfig.providers[modelOf(key).provider]!.key_env)
    expect(keyEnvs).toEqual([...PAID_SECRET_NAMES])
  })

  it('offers the chain in that order to a real call, dropping models that cannot do the job', () => {
    const text = candidatesFor(defaultConfig, 'meal_analysis', { vision: false, tools: false })
    expect(text.map((c) => c.providerName)).toEqual(providersOf('text'))

    const vision = candidatesFor(defaultConfig, 'scan_extract', { vision: true, tools: false })
    expect(vision.length).toBeGreaterThan(1)
    expect(vision.every((c) => c.spec.vision)).toBe(true)
    expect(vision[0]!.providerName).toBe('anthropic')
    expect(vision.find((c) => !c.spec.paid)!.providerName).toBe('openrouter')
    expect(vision.at(-1)!.providerName).toBe('gemini')
  })
})
