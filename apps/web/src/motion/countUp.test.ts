// Owns: the count-up curve's guarantees — it starts where it was told, lands exactly on the real number (a count-up
// that ends one digit shy would show wrong data), and front-loads its travel the way an ease-out must.
import { describe, expect, it } from 'vitest'
import { countUpValue, easeOutExpo } from './countUp'

describe('countUpValue', () => {
  it('starts at `from` and lands exactly on `to`', () => {
    expect(countUpValue(0, 860, 0, 1600)).toBe(0)
    expect(countUpValue(95.1, 93.6, 1600, 1600)).toBe(93.6)
    expect(countUpValue(0, 860, 5000, 1600)).toBe(860)
    expect(easeOutExpo(1)).toBe(1)
  })

  it('covers most of the distance early, as an exponential ease-out does', () => {
    // A quarter of the way through the run, 2^(−2.5) ≈ 0.177 is left to travel: about 82 % of 860 is on screen.
    expect(countUpValue(0, 860, 400, 1600)).toBeCloseTo(860 * 0.8241, 0)
    expect(countUpValue(0, 860, 800, 1600)).toBeGreaterThan(860 * 0.96)
  })
})
