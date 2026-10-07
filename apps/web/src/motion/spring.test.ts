// Owns: the spring maths the whole interface animates with. It is pure and DOM-free, which is why it is the app's
// first unit-tested module: the properties that make the motion feel right — a curve that settles when its duration
// says it does, no overshoot where none was asked for, and a velocity that stays continuous across an interruption —
// are exactly the ones that are invisible in a screenshot and expensive to catch by eye.
import { describe, expect, it } from 'vitest'
import {
  projectMomentum,
  rubberband,
  settleTime,
  springFrames,
  springStep,
  SPRING_DEFAULT,
  SPRING_MOMENTUM,
  velocityFrom,
} from './spring'

const SPRINGS = [SPRING_DEFAULT, SPRING_MOMENTUM] as const

describe('springStep', () => {
  it('starts at the current value, moving at the velocity it was handed', () => {
    for (const spring of SPRINGS) {
      const start = springStep(spring, 0, 120, 0, -400)
      expect(start.value).toBeCloseTo(120, 6)
      // Velocity continuity: a gesture's release velocity must survive into the animation, or the seam shows.
      expect(start.velocity).toBeCloseTo(-400, 6)
    }
  })

  it('converges on the target', () => {
    for (const spring of SPRINGS) {
      const { value, velocity } = springStep(spring, 5, 0, 250, 0)
      expect(value).toBeCloseTo(250, 6)
      expect(velocity).toBeCloseTo(0, 6)
    }
  })

  // The guard that matters: `velocity` is an analytic derivative, and a gesture hands its own velocity straight back
  // into the next spring. If the two ever disagreed, every interrupted animation would show a kink.
  it('reports a velocity that is the actual derivative of its value', () => {
    const h = 1e-5
    for (const spring of SPRINGS) {
      for (const t of [0.05, 0.2, 0.45, 0.9]) {
        const at = (seconds: number) => springStep(spring, seconds, 0, 100, 250).value
        const numeric = (at(t + h) - at(t - h)) / (2 * h)
        expect(springStep(spring, t, 0, 100, 250).velocity).toBeCloseTo(numeric, 3)
      }
    }
  })

  it('never overshoots when critically damped, and overshoots when it is asked to', () => {
    // Critically damped: the approach is monotonic, so a value that appears without momentum never bounces.
    for (let i = 0; i <= 60; i += 1) {
      expect(springStep(SPRING_DEFAULT, i / 60, 0, 100).value).toBeLessThanOrEqual(100.000001)
    }
    // Under-damped: the flick's momentum carries it past the target, which is the whole point of the bounce.
    let peak = 0
    for (let i = 0; i <= 120; i += 1) peak = Math.max(peak, springStep(SPRING_MOMENTUM, i / 120, 0, 100).value)
    expect(peak).toBeGreaterThan(101)
  })
})

describe('settleTime', () => {
  it('derives a duration rather than prescribing one', () => {
    for (const spring of SPRINGS) {
      const settle = settleTime(spring)
      // A spring's settle time emerges from its parameters, so it is always longer than the response itself...
      expect(settle).toBeGreaterThan(spring.response)
      // ...and still short enough to read as a response rather than as a wait.
      expect(settle).toBeLessThan(1)
    }
    // Memoised per spring: this is read during render, and the search is not free.
    expect(settleTime(SPRING_DEFAULT)).toBe(settleTime(SPRING_DEFAULT))
  })
})

describe('projectMomentum', () => {
  it('matches the deceleration Apple ships for a flick', () => {
    // (v/1000) · d/(1−d) at d = 0.998: a 1000 px/s flick is projected to travel 499 px before it rests.
    expect(projectMomentum(1000)).toBeCloseTo(499, 6)
    expect(projectMomentum(0)).toBe(0)
    // Direction is preserved, so a drag the other way projects the other way.
    expect(projectMomentum(-1000)).toBeCloseTo(-499, 6)
  })
})

describe('rubberband', () => {
  it('resists progressively past a boundary and never reverses it', () => {
    expect(rubberband(0, 400)).toBe(0)
    const small = rubberband(20, 400)
    const large = rubberband(200, 400)
    expect(small).toBeGreaterThan(0)
    // The further past the edge, the less of the overshoot survives: a soft limit, not a hard stop.
    expect(large).toBeGreaterThan(small)
    expect(large).toBeLessThan(200)
    expect(rubberband(-200, 400)).toBeCloseTo(-large, 6)
  })
})

describe('velocityFrom', () => {
  it('measures the pointer over the recent window', () => {
    expect(velocityFrom([{ position: 0, time: 0 }, { position: 100, time: 100 }])).toBeCloseTo(1000, 6)
    // One sample is not a velocity.
    expect(velocityFrom([{ position: 40, time: 0 }])).toBe(0)
    expect(velocityFrom([])).toBe(0)
    // Samples older than the window do not dilute a flick into nothing.
    expect(velocityFrom([
      { position: 0, time: 0 },
      { position: 50, time: 50 },
      { position: 200, time: 200 },
    ])).toBeCloseTo(1000, 6)
  })
})

describe('springFrames', () => {
  it('starts where the drag left it, ends exactly on the target, and reports the time it was built for', () => {
    const { frames, duration } = springFrames(SPRING_MOMENTUM, 180, 0, -900)
    expect(frames[0].transform).toBe('translateY(180px)')
    // The last frame is the target itself, so the element can be handed back to CSS without a jump.
    expect(frames[frames.length - 1].transform).toBe('translateY(0px)')
    expect(frames.length).toBeGreaterThan(10)
    // The duration travels with the frames, so a caller cannot clip the tail or leave it hanging at the end.
    expect(duration).toBeGreaterThan(settleTime(SPRING_MOMENTUM) * 1000)
    expect(duration).toBeLessThan(1200)
  })
})
