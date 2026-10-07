// Owns: reading the seed's exclusion rules (seed/equipment/*.json) against the exercise library — the first matching
// rule wins: a name pattern (except_equipment skips that rule for those equipment values), then an excluded category,
// then an excluded equipment value. Shared by build-seed.ts, which materialises one exclusion row per excluded
// exercise, and the seed test, so both read the same JSON the same way.
//
// The rules an equipment *status* adds (dont_have / cant_use / dislike, and a blocked named machine inside an
// exercise's name) are not here: those are evaluated live by the Worker (training/lib/library.ts).
import type { LibraryExercise } from '@fitness/exercises'

export interface ExclusionRules {
  name_patterns: readonly { pattern: string; reason: string; except_equipment: readonly string[] }[]
  categories: readonly { category: string; reason: string }[]
  equipment: readonly { equipment: string; reason: string }[]
}

/** Why `ex` is outside the allowed exercise set, or null when nothing in `rules` excludes it. */
export function exclusionReason(ex: Pick<LibraryExercise, 'name' | 'category' | 'equipment'>, rules: ExclusionRules): string | null {
  for (const r of rules.name_patterns) {
    if (new RegExp(r.pattern, 'i').test(ex.name) && !r.except_equipment.includes(ex.equipment)) return r.reason
  }
  return (
    rules.categories.find((c) => c.category === ex.category)?.reason ??
    rules.equipment.find((e) => e.equipment === ex.equipment)?.reason ??
    null
  )
}
