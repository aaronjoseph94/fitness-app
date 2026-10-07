// Owns: the shipped chain order in providers.json — text is Groq → OpenRouter → Gemini last (Aaron, 2026-10-06);
// vision has no Groq model, so OpenRouter leads and Gemini stays last. Pure: no fetch, no key, no database; the
// router's own behaviour is covered by ./router.test.ts with its own config.
import { describe, expect, it } from 'vitest'
import { candidatesFor, defaultConfig } from '../lib/config'

type Chain = 'text' | 'vision'

/** The provider names of a chain, in the order the router would try them. */
const providersOf = (chain: Chain) => defaultConfig.chains[chain]!.map((key) => defaultConfig.models[key]!.provider)

describe('provider chains', () => {
  it('tries Groq first for text', () => {
    const spec = defaultConfig.models[defaultConfig.chains.text![0]!]!
    expect(spec.provider).toBe('groq')
    expect(defaultConfig.providers[spec.provider]!.key_env).toBe('GROQ_API_KEY')
    expect(spec.tools).toBe(true)
  })

  it('puts OpenRouter after Groq and before Gemini on the text chain', () => {
    const order = providersOf('text')
    expect(order.indexOf('groq')).toBe(0)
    expect(order.indexOf('openrouter')).toBeGreaterThan(order.indexOf('groq'))
    expect(order.indexOf('gemini')).toBeGreaterThan(order.indexOf('openrouter'))
    expect(order[order.length - 1]).toBe('gemini')
  })

  it('leads vision with OpenRouter (no Groq vision model) and keeps Gemini last', () => {
    const spec = defaultConfig.models[defaultConfig.chains.vision![0]!]!
    expect(spec.provider).toBe('openrouter')
    expect(spec.vision).toBe(true)
    const order = providersOf('vision')
    expect(order).toContain('gemini')
    expect(order[0]).not.toBe('gemini')
    expect(order[order.length - 1]).toBe('gemini')
  })

  it('offers the chain in that order to a real call, dropping models that cannot do the job', () => {
    const text = candidatesFor(defaultConfig, 'meal_analysis', { vision: false, tools: false })
    expect(text.map((c) => c.providerName)).toEqual(providersOf('text'))

    const vision = candidatesFor(defaultConfig, 'scan_extract', { vision: true, tools: false })
    expect(vision.length).toBeGreaterThan(1)
    expect(vision.every((c) => c.spec.vision)).toBe(true)
    expect(vision[0]!.providerName).toBe('openrouter')
    expect(vision.at(-1)!.providerName).toBe('gemini')
  })
})
