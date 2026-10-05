// Owns: small presentation statistics the charts derive from the series they are given (no engine logic).

/** Median of the finite values; null when there are none. */
export function median(values: readonly (number | null | undefined)[]): number | null {
  const v = values
    .filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
    .sort((a, b) => a - b)
  if (v.length === 0) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2
}

/** Trailing median over `window` entries ending at each index (shorter at the start). */
export function rollingMedian(
  values: readonly (number | null | undefined)[],
  window: number,
): (number | null)[] {
  return values.map((_, i) => median(values.slice(Math.max(0, i - window + 1), i + 1)))
}

/** "HH:MM" → minutes after 18:00, so an evening-to-early-morning bedtime is one continuous scale (22:30 → 270). */
export function bedtimeMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm)
  if (!m) return null
  const mins = Number(m[1]) * 60 + Number(m[2])
  return (mins - 18 * 60 + 24 * 60) % (24 * 60)
}

/** Inverse of bedtimeMinutes: 270 → "22:30". */
export function bedtimeLabel(minutesAfter18: number): string {
  const total = (minutesAfter18 + 18 * 60) % (24 * 60)
  const h = Math.floor(total / 60)
  const m = Math.round(total % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
