// Owns: the weekly upper / lower split (SPEC §7 default: upper / lower / upper / lower over the training days) — which
// slot each training day is, its name ("Upper A", "Lower A", "Upper B", …), and the key a split day, a template and a
// draft are matched by.
import { Weekday } from '../../schemas/common'
import type { SplitSlot } from '../../schemas/training'

const LETTERS = 'ABCDEFG'

/**
 * The split over the training days, in week order Mon → Sun (duplicates once). For position i:
 *   focus  = i even → 'upper', i odd → 'lower'
 *   name   = "Upper" | "Lower" + ' ' + 'ABCDEFG'[⌊i / 2⌋]
 * Mon–Thu → Upper A, Lower A, Upper B, Lower B.
 */
export function splitSlots(training_days: readonly Weekday[]): SplitSlot[] {
  return Weekday.options
    .filter((d) => training_days.includes(d))
    .map((weekday, i) => {
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
