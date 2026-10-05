// Owns: the engine's small numeric helpers (mean, median, clamp, rounding). Internal — not part of the engine interface.

/** mean(xs) = Σx / n; null for an empty list. */
export function mean(xs: readonly number[]): number | null {
  if (xs.length === 0) return null
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

/** median(xs) = middle value of the sorted list (mean of the two middle values when n is even); null when empty. */
export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

/** clamp(x, lo, hi) = min(max(x, lo), hi). */
export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi)
}

/** round(x, dp) = x rounded half away from zero to `dp` decimal places. */
export function round(x: number, dp = 0): number {
  const f = 10 ** dp
  return (Math.sign(x) * Math.round(Math.abs(x) * f)) / f
}
