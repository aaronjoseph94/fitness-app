// Owns: the weekly split over the training days (SPEC §7: upper / lower / upper / lower for four or more days; one to
// three days follow the rest between them, so every body part is trained on some day) — which slot each training day
// is, its name ("Upper A", "Lower A", "Full body", …), the key a split day, a template and a draft are matched by, and
// which template is a split day's when several share its name.
import { Weekday } from '../../schemas/common'
import type { SplitSlot } from '../../schemas/training'

const LETTERS = 'ABCDEFG'

/**
 * Days from training day a forward to the next training day b, wrapping the week (Sun → Mon is 1 day, Thu → Mon is 4):
 *   gap(a → b) = (index(b) − index(a) + 7) mod 7, in 1..6 for two different days.
 */
function gap(a: Weekday, b: Weekday): number {
  return (Weekday.options.indexOf(b) - Weekday.options.indexOf(a) + 7) % 7
}

/**
 * The split over the training days, in week order Mon → Sun (duplicates once). With n = the number of distinct days and
 * i = a day's position in week order:
 *   rest(d) = min(gap(previous training day → d), gap(d → next training day))
 *   n = 1   → "Full body"                                  (focus 'full')
 *   n = 2   → rest = 1 (back to back, Sun + Mon too): i = 0 "Upper A" ('upper'), i = 1 "Lower A" ('lower')
 *             otherwise: "Full body " + 'AB'[i]            (focus 'full')
 *   n = 3   → "Full body" on the day with the largest rest(d), ties to the latest day in week order; the other two,
 *             in week order, are "Upper A" then "Lower A"
 *   n ≥ 4   → focus = i even → 'upper', i odd → 'lower'
 *             name  = "Upper" | "Lower" + ' ' + 'ABCDEFG'[⌊i / 2⌋]
 * Mon–Thu → Upper A, Lower A, Upper B, Lower B; Mon, Tue, Thu → Upper A, Lower A, Full body (rest 1, 1, 2);
 * Tue, Thu, Fri → Full body, Upper A, Lower A (rest 2, 1, 1).
 */
export function splitSlots(training_days: readonly Weekday[]): SplitSlot[] {
  const days = Weekday.options.filter((d) => training_days.includes(d))
  const n = days.length
  const upperLower = (weekday: Weekday, focus: 'upper' | 'lower', letter: string): SplitSlot => ({
    weekday,
    name: `${focus === 'upper' ? 'Upper' : 'Lower'} ${letter}`,
    focus,
  })
  if (n === 1) return [{ weekday: days[0]!, name: 'Full body', focus: 'full' }]
  if (n === 2) {
    const [first, second] = days as [Weekday, Weekday]
    const back_to_back = Math.min(gap(first, second), gap(second, first)) === 1
    return back_to_back
      ? [upperLower(first, 'upper', 'A'), upperLower(second, 'lower', 'A')]
      : [
          { weekday: first, name: 'Full body A', focus: 'full' },
          { weekday: second, name: 'Full body B', focus: 'full' },
        ]
  }
  if (n === 3) {
    const rest = days.map((d, i) => Math.min(gap(days[(i + 2) % 3]!, d), gap(d, days[(i + 1) % 3]!)))
    const best = Math.max(...rest)
    const full = rest.lastIndexOf(best)
    let placed = 0
    return days.map((weekday, i): SplitSlot => {
      if (i === full) return { weekday, name: 'Full body', focus: 'full' }
      return placed++ === 0 ? upperLower(weekday, 'upper', 'A') : upperLower(weekday, 'lower', 'A')
    })
  }
  return days.map((weekday, i) => upperLower(weekday, i % 2 === 0 ? 'upper' : 'lower', LETTERS[Math.floor(i / 2)]!))
}

/** The weekday's slot in splitSlots(training_days); null when it is not a training day. */
export function splitSlot(weekday: Weekday, training_days: readonly Weekday[]): SplitSlot | null {
  return splitSlots(training_days).find((s) => s.weekday === weekday) ?? null
}

/**
 * The key a split day, a template and a draft are matched by: key(name) = lower(trim(name)), so " upper a " = "Upper A"
 * (deleting or renaming a template frees its split day for a fresh draft). SQL matching by name uses lower(trim(x)),
 * the same key for the split's names (SQLite's lower and trim cover ASCII letters and spaces only).
 */
export function splitNameKey(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * The template of a split day: among `templates` whose splitNameKey equals splitNameKey(name), the oldest by created_at
 * (ISO instants compare as strings), ties by the smaller id; null when none has the name. One rule for the worker (the
 * week, Keep, a redraft) and the web, so a second template of the same name never takes the day.
 */
export function splitTemplateFor<T extends { id: string; name: string; created_at: string }>(templates: readonly T[], name: string): T | null {
  const key = splitNameKey(name)
  let best: T | null = null
  for (const t of templates) {
    if (splitNameKey(t.name) !== key) continue
    if (!best || t.created_at < best.created_at || (t.created_at === best.created_at && t.id < best.id)) best = t
  }
  return best
}
