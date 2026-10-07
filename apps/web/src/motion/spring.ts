// Owns: the spring maths behind every animation in the app. Pure, dependency-free and DOM-free, so it can be unit
// tested and so nothing here can create an import cycle with `theme.ts` (which builds its motion tokens from it).
//
// Apple replaced the physics triplet (mass / stiffness / damping) with two designer-facing parameters, and this module
// speaks those two and only those:
//
//   response  how quickly the value reaches its target, in seconds. **Not a duration** — a spring has no fixed
//             duration; its settle time emerges from the parameters, which is why `settleTime()` derives it here
//             rather than anyone prescribing it.
//   damping   the damping ratio. `1` is critically damped (no overshoot); below `1` overshoots and oscillates.
//
// The motion the whole interface is built on needs both a *value* and a *velocity* at any instant: a value so an
// interrupted animation can resume from what is actually on screen, and a velocity so a gesture can hand its own
// momentum to the animation that follows. `springStep()` returns both, solved analytically — no per-frame integration,
// no `requestAnimationFrame`, so a throttled or non-compositing window cannot leave an animation stuck half-way.

/** A spring in Apple's terms. */
export interface Spring {
  /** Seconds: how quickly the value reaches the target. Lower is snappier. Not a duration. */
  response: number
  /** Damping ratio: `1` critically damped (no overshoot), `< 1` overshoots. Never above `1` here. */
  damping: number
}

/**
 * The house default: critically damped, response 0.35 s. Graceful and non-distracting, so it is right for anything
 * that appears without the user having thrown it — a page's hero, its card groups, a sheet materialising.
 */
export const SPRING_DEFAULT: Spring = { response: 0.35, damping: 1 }

/**
 * A sheet settling after the user dragged it: Apple's own drawer/sheet values (damping 0.8, response 0.3). The slight
 * overshoot is earned here and only here, because a gesture carried momentum into the release.
 */
export const SPRING_MOMENTUM: Spring = { response: 0.3, damping: 0.8 }

/**
 * When a spring counts as settled: within 0.1 % of the distance travelled *and* moving at under 1 % of it per second.
 * Both matter — a spring passing through its target at speed is not at rest, and a strict velocity bound is what
 * stops the derived duration from running far past the point where any of the motion is perceptible (a 10 px rise
 * needs the last 0.1 px/s of it resolved, no more).
 */
const REST_DISPLACEMENT = 0.001
const REST_VELOCITY = 0.01

/** A spring's angular frequency, in radians per second. */
function omega(spring: Spring): number {
  return (2 * Math.PI) / spring.response
}

/** The damping ratio, clamped to the range this module solves analytically. */
function zeta(spring: Spring): number {
  return Math.min(1, Math.max(0, spring.damping))
}

/**
 * The spring's value and velocity `elapsed` seconds in, having started at `from` moving at `velocity` units/s toward
 * `to`. Solved in closed form: critically damped at `damping >= 1`, under-damped below it.
 */
export function springStep(
  spring: Spring,
  elapsed: number,
  from: number,
  to: number,
  velocity = 0,
): { value: number; velocity: number } {
  const w = omega(spring)
  const z = zeta(spring)
  // Displacement from the target, which is what both solutions are written in terms of.
  const x0 = from - to
  const t = Math.max(0, elapsed)

  if (z >= 1) {
    // Critically damped: x = (x0 + c·t)·e^(-ωt), with c = v0 + ω·x0. No overshoot to reach the target.
    const c = velocity + w * x0
    const decay = Math.exp(-w * t)
    return {
      value: to + (x0 + c * t) * decay,
      velocity: decay * (velocity - w * c * t),
    }
  }

  // Under-damped: a decaying oscillation, x = e^(-λt)·(a·cos(ωd·t) + b·sin(ωd·t)).
  const wd = w * Math.sqrt(1 - z * z)
  const lambda = z * w
  const a = x0
  const b = (velocity + lambda * x0) / wd
  const decay = Math.exp(-lambda * t)
  const cos = Math.cos(wd * t)
  const sin = Math.sin(wd * t)
  return {
    value: to + decay * (a * cos + b * sin),
    velocity: decay * ((b * wd - lambda * a) * cos - (lambda * b + a * wd) * sin),
  }
}

const settleCache = new Map<string, number>()

/**
 * How long this spring takes to settle, in seconds — the duration a CSS transition should be given so the curve is
 * not cut off part-way. Found by stepping the decay envelope (cheap, and it is memoised per spring) because the
 * closed-form answer differs between the damped cases and the envelope is what actually governs settling.
 */
export function settleTime(spring: Spring): number {
  const key = `${spring.response}/${spring.damping}`
  const cached = settleCache.get(key)
  if (cached !== undefined) return cached

  // A unit step (from 0 to 1, released at rest), to which every entrance normalises.
  const step = 1 / 480
  let t = 0
  for (let i = 0; i < 4800; i += 1) {
    t = i * step
    const { value, velocity } = springStep(spring, t, 0, 1)
    if (Math.abs(1 - value) <= REST_DISPLACEMENT && Math.abs(velocity) <= REST_VELOCITY) break
  }
  settleCache.set(key, t)
  return t
}

/**
 * The spring as a CSS `linear()` easing curve: `stops` evenly spaced samples of the unit step across its own settle
 * time, so the curve and the duration always agree. Values outside 0–1 are the overshoot, which is exactly what
 * `linear()` is for. Returns `null` where the browser cannot parse one, so a caller can fall back to a cubic-bézier.
 */
export function springCurve(spring: Spring, stops = 24): string | null {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return null
  const settle = settleTime(spring)
  const samples: number[] = []
  for (let i = 0; i <= stops; i += 1) {
    const { value } = springStep(spring, (settle * i) / stops, 0, 1)
    samples.push(Math.round(value * 10000) / 10000)
  }
  const curve = `linear(${samples.join(', ')})`
  return CSS.supports('transition-timing-function', curve) ? curve : null
}

/**
 * Apple's momentum projection: where a gesture released at `velocity` px/s is *going*, not where it was let go. The
 * exponential-decay form Apple ships (not the physics-textbook `v²/2a`), with the deceleration rate that gives normal
 * scroll feel. Used to choose a sheet's resting place from the flick rather than from the release point.
 */
export function projectMomentum(velocity: number, deceleration = 0.998): number {
  return (velocity / 1000) * (deceleration / (1 - deceleration))
}

/**
 * Progressive resistance past a boundary: the further past the edge, the less the element follows the finger, so a
 * soft limit reads as "responsive, but there is nothing more here" rather than as a frozen surface.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot))
}

/** A frame of an animation, in the shape `Element.animate()` takes. */
/**
 * One frame of an animation, in the shape `Element.animate()` takes — which is why it carries an index signature:
 * a `Keyframe` is `{ [property: string]: string | number | undefined | null }`, so a narrower object will not
 * satisfy it. The only property this module ever writes is `transform`.
 */
export interface SpringFrame {
  transform: string
  [property: string]: string
}

/** Keyframes, and the time they were built to run for. The two are returned together on purpose. */
export interface SpringKeyframes {
  frames: SpringFrame[]
  /** Milliseconds. The spring's own settle time with a little headroom, so its visible tail is never clipped. */
  duration: number
}

/**
 * Keyframes for settling from `from` to `to` px with `velocity` handed over, so the browser can drive the animation
 * on its own clock: no `requestAnimationFrame` loop of ours, and a frame that never arrives cannot strand the element
 * between two states. The samples are the analytic solution, so the motion is the spring rather than an imitation of
 * one; the last frame is exactly the target, which is what makes it safe to hand the element back to CSS. The
 * duration travels with the frames because a caller that chose its own could clip the tail or hold still at the end.
 */
export function springFrames(spring: Spring, from: number, to: number, velocity = 0, stops = 60): SpringKeyframes {
  const seconds = settleTime(spring) * 1.2
  const frames: SpringFrame[] = []
  for (let i = 0; i <= stops; i += 1) {
    const t = (seconds * i) / stops
    const { value } = i === stops ? { value: to } : springStep(spring, t, from, to, velocity)
    frames.push({ transform: `translateY(${value}px)` })
  }
  return { frames, duration: Math.round(seconds * 1000) }
}

/**
 * The velocity of a pointer, in px/s, from a short history of `(position, timestamp)` samples. Taken over roughly the
 * last 100 ms because that is the window a person's intent actually lives in: a longer one averages a flick away to
 * nothing, which is the momentum the release needs to hand over.
 */
export function velocityFrom(samples: readonly { position: number; time: number }[]): number {
  if (samples.length < 2) return 0
  const last = samples[samples.length - 1]
  let first = samples[0]
  for (let i = samples.length - 1; i >= 0; i -= 1) {
    first = samples[i]
    if (last.time - samples[i].time >= 100) break
  }
  const elapsed = (last.time - first.time) / 1000
  if (elapsed <= 0) return 0
  return (last.position - first.position) / elapsed
}
