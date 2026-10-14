// Owns: the weekly split over the training days (SPEC §7: upper / lower / upper / lower for four or more days; three
// days are Upper A, Lower A, Full body; one or two days are whole-body sessions) — which slot each training day is, its
// name ("Upper A", "Lower A", "Full body", …), and the key a split day, a template and a draft are matched by.
import { Weekday } from '../../schemas/common'
import type { SplitSlot } from '../../schemas/training'

const LETTERS = 'ABCDEFG'

/**
 * The split over the training days, in week order Mon → Sun (duplicates once). With n = the number of distinct days
 * and i = a day's position in week order:
 *   n = 1        → "Full body"                                  (focus 'full')
 *   n = 2        → "Full body " + 'AB'[i]                       (focus 'full')
 *   n = 3        → Upper A (i = 0), Lower A (i = 1), Full body (i = 2)
 *   n ≥ 4        → focus = i even → 'upper', i odd → 'lower'
 *                  name  = "Upper" | "Lower" + ' ' + 'ABCDEFG'[⌊i / 2⌋]
 * Mon–Thu → Upper A, Lower A, Upper B, Lower B; Mon, Tue, Thu → Upper A, Lower A, Full body.
 */
export function splitSlots(training_days: readonly Weekday[]): SplitSlot[] {
  const days = Weekday.options.filter((d) => training_days.includes(d))
  const n = days.length
  return days.map((weekday, i): SplitSlot => {
    if (n === 1) return { weekday, name: 'Full body', focus: 'full' }
    if (n === 2) return { weekday, name: `Full body ${LETTERS[i]}`, focus: 'full' }
    if (n === 3 && i === 2) return { weekday, name: 'Full body', focus: 'full' }
    const focus = i % 2 === 0 ? 'upper' : 'lower'
    return { weekday, name: `${focus === 'upper' ? 'Upper' : 'Lower'} ${LETTERS[Math.floor(i / 2)]}`, focus }
  })
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
