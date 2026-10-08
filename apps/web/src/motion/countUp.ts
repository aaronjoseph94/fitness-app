// Owns: the count-up maths behind a headline number (2a: "headline numbers count up over ~1.6 s with an exponential
// ease-out"). Pure and DOM-free like `spring.ts`, so the curve is unit-tested and the component that plays it
// (`components/lib/CountUp.tsx`) only schedules frames.

/**
 * The exponential ease-out, normalised so it starts at exactly 0 and lands on exactly 1:
 *   e(t) = (1 − 2^(−10·t)) / (1 − 2^(−10)),  t ∈ [0, 1]
 * (the un-normalised `1 − 2^(−10t)` stops 0.1 % short of the target, which would leave a count-up one digit shy).
 */
export function easeOutExpo(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return (1 - 2 ** (-10 * t)) / (1 - 2 ** -10)
}

/**
 * The number a count-up shows `elapsed` ms into a run of `duration` ms from `from` to `to`:
 *   v = from + (to − from) · e(elapsed / duration)
 * Exactly `to` once the run is over (and for a zero-length run), exactly `from` before it starts.
 */
export function countUpValue(from: number, to: number, elapsed: number, duration: number): number {
  if (duration <= 0 || elapsed >= duration) return to
  if (elapsed <= 0) return from
  return from + (to - from) * easeOutExpo(elapsed / duration)
}
