// Owns: the weekly upper / lower split (SPEC §7 default: upper / lower / upper / lower over the training days) — which
// slot each training day is, and its name ("Upper A", "Lower A", "Upper B", …).
import { Weekday } from '../../schemas/common'

/** One training day of the split. */
export interface SplitSlotLike {
  weekday: Weekday
  /** "Upper A", "Lower A", "Upper B", … */
  name: string
  focus: 'upper' | 'lower'
}

const LETTERS = 'ABCDEFG'

/**
 * The split over the training days, in week order Mon → Sun (duplicates once). For position i:
 *   focus  = i even → 'upper', i odd → 'lower'
 *   name   = "Upper" | "Lower" + ' ' + 'ABCDEFG'[⌊i / 2⌋]
 * Mon–Thu → Upper A, Lower A, Upper B, Lower B.
 */
export function splitSlots(training_days: readonly Weekday[]): SplitSlotLike[] {
  return Weekday.options
    .filter((d) => training_days.includes(d))
    .map((weekday, i) => {
      const focus = i % 2 === 0 ? 'upper' : 'lower'
      return { weekday, name: `${focus === 'upper' ? 'Upper' : 'Lower'} ${LETTERS[Math.floor(i / 2)]}`, focus }
    })
}

/** The weekday's slot in splitSlots(training_days); null when it is not a training day. */
export function splitSlot(weekday: Weekday, training_days: readonly Weekday[]): SplitSlotLike | null {
  return splitSlots(training_days).find((s) => s.weekday === weekday) ?? null
}
