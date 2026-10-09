// Owns: which exercises can stand in for another (SPEC §9 safe list: a swap stays within the same primary muscle) —
// the same-muscle, same-kind-of-lift filter and the ranking the swap picker, AI preview and mid-session swap share.
import type { Muscle } from '../../schemas/common'

/**
 * What a swap needs to know about an exercise. Structurally satisfied by `ExerciseSummary` / `Exercise` (web) and the
 * worker's library rows; `allowed` absent counts as allowed.
 */
export interface SwapInfo {
  id: string
  name: string
  /** free-exercise-db category ("strength", "cardio", …); null for a user exercise without one. */
  category: string | null
  equipment: string | null
  /** "compound" | "isolation" | null. */
  mechanic: string | null
  primary_muscles: readonly Muscle[]
  secondary_muscles: readonly Muscle[]
  allowed?: boolean
}

/** Kind of lift: strength, powerlifting and no category → 'lifting'; any other category is its own kind. */
function liftKind(category: string | null): string {
  return category === null || category === 'strength' || category === 'powerlifting' ? 'lifting' : category
}

const shared = (a: readonly Muscle[], b: readonly Muscle[]) => a.filter((m) => b.includes(m)).length
const same = (a: string | null, b: string | null) => a !== null && b !== null && a === b

/**
 * score = 10 × |primary(c) ∩ primary(target)|
 *       + 4 if mechanic(c) = mechanic(target) (both known)
 *       + 3 if equipment(c) = equipment(target) (both known)
 *       + 1 × |secondary(c) ∩ secondary(target)|
 */
export function swapScore(target: SwapInfo, candidate: SwapInfo): number {
  return (
    10 * shared(candidate.primary_muscles, target.primary_muscles) +
    (same(candidate.mechanic, target.mechanic) ? 4 : 0) +
    (same(candidate.equipment, target.equipment) ? 3 : 0) +
    shared(candidate.secondary_muscles, target.secondary_muscles)
  )
}

/**
 * Swap candidates for `target`: every e in `library` with
 *   e.id ≠ target.id, e.id ∉ exclude, e.allowed ≠ false,
 *   |primary(e) ∩ primary(target)| ≥ 1, and liftKind(e.category) = liftKind(target.category)
 * sorted by swapScore desc, then name asc.
 */
export function swapCandidates<T extends SwapInfo>(target: SwapInfo, library: readonly T[], exclude?: ReadonlySet<string>): T[] {
  const kind = liftKind(target.category)
  return library
    .filter(
      (e) =>
        e.id !== target.id &&
        !exclude?.has(e.id) &&
        e.allowed !== false &&
        shared(e.primary_muscles, target.primary_muscles) > 0 &&
        liftKind(e.category) === kind,
    )
    .map((e) => ({ e, score: swapScore(target, e) }))
    .sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name))
    .map((x) => x.e)
}
