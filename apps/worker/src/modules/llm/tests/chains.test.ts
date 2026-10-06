// Owns: the shipped chain order in providers.json — OpenRouter's free models lead both chains and Gemini stays in them
// as a fallback (Aaron's call, 2026-10-06). Pure: no fetch, no key, no database; the router's own behaviour is covered
// by ./router.test.ts with its own config.
import { describe, expect, it } from 'vitest'
import { candidatesFor, defaultConfig } from '../lib/config'

type Chain = 'text' | 'vision'

/** The provider names of a chain, in the order the router would try them. */
const providersOf = (chain: Chain) => defaultConfig.chains[chain]!.map((key) => defaultConfig.models[key]!.provider)

describe('provider chains', () => {
  it('tries an OpenRouter model first, for text and for vision alike', () => {
    for (const chain of ['text', 'vision'] as const) {
      const spec = defaultConfig.models[defaultConfig.chains[chain]![0]!]!
      expect(spec.provider).toBe('openrouter')
      expect(defaultConfig.providers[spec.provider]!.key_env).toBe('OPENROUTER_API_KEY')
      // The leading model must be able to do the job the chain exists for.
      expect(chain === 'vision' ? spec.vision : spec.tools).toBe(true)
    }
  })

  it('still lists Gemini in both chains, as a fallback rather than the primary', () => {
    for (const chain of ['text', 'vision'] as const) {
      expect(providersOf(chain)).toContain('gemini')
      expect(providersOf(chain)[0]).not.toBe('gemini')
    }
  })

  it('offers the chain in that order to a real call, dropping models that cannot do the job', () => {
    const text = candidatesFor(defaultConfig, 'meal_analysis', { vision: false, tools: false })
    expect(text.map((c) => c.providerName)).toEqual(providersOf('text'))

    const vision = candidatesFor(defaultConfig, 'scan_extract', { vision: true, tools: false })
    expect(vision.length).toBeGreaterThan(1)
    expect(vision.every((c) => c.spec.vision)).toBe(true)
    expect(vision[0]!.providerName).toBe('openrouter')
  })
})
