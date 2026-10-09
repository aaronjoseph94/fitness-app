// Owns: narrowing the library — free-text search over name / equipment / muscles, the muscle, equipment, category and
// level filters, allowed-only by default, and the swap list (the engine's swap rule: same primary muscle and same kind of
// lift as a given exercise). Pure functions.
import { swapCandidates } from '@fitness/shared/engine'
import type { ExerciseSummary, ExerciseCategory, Muscle } from '@fitness/shared/schemas'

export interface ExerciseFilter {
  muscle?: Muscle
  equipment?: string
  category?: ExerciseCategory
  level?: ExerciseSummary['level']
}

export interface FilterInput extends ExerciseFilter {
  q?: string
  /** Include exercises outside the allowed exercise set. Default false. */
  includeHidden?: boolean
}

function words(q: string): string[] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9-]/g, ''))
    .filter(Boolean)
}

function haystack(e: ExerciseSummary): string {
  return [e.name, e.equipment ?? '', ...e.primary_muscles, ...e.secondary_muscles].join(' ').toLowerCase()
}

/**
 * Exercises matching every filter, ranked: name starts with the query, then name contains every word, then any field
 * contains every word; ties by name. A muscle filter matches primary muscles only (what the exercise is for).
 */
export function filterExercises(list: readonly ExerciseSummary[], input: FilterInput): ExerciseSummary[] {
  const terms = words(input.q ?? '')
  const q = terms.join(' ')
  const ranked: { e: ExerciseSummary; rank: number }[] = []
  for (const e of list) {
    if (!input.includeHidden && !e.allowed) continue
    if (input.muscle && !e.primary_muscles.includes(input.muscle)) continue
    if (input.equipment && e.equipment !== input.equipment) continue
    if (input.category && e.category !== input.category) continue
    if (input.level && e.level !== input.level) continue
    if (terms.length === 0) {
      ranked.push({ e, rank: 0 })
      continue
    }
    const name = e.name.toLowerCase()
    const all = haystack(e)
    if (!terms.every((t) => all.includes(t))) continue
    const rank = name.startsWith(q) ? 0 : terms.every((t) => name.includes(t)) ? 1 : 2
    ranked.push({ e, rank })
  }
  ranked.sort((a, b) => a.rank - b.rank || a.e.name.localeCompare(b.e.name))
  return ranked.map((r) => r.e)
}

/**
 * Swap candidates for `target` (engine `swapCandidates`): allowed exercises sharing at least one of its primary muscles
 * and the same kind of lift (strength and powerlifting together; cardio and Olympic lifts only with their own kind),
 * neither the target nor any id in `exclude`, ranked by
 *   10 × shared primary + 4 if same mechanic + 3 if same equipment + 1 per shared secondary, then by name.
 */
export function sameMuscleCandidates(
  list: readonly ExerciseSummary[],
  target: ExerciseSummary,
  exclude?: ReadonlySet<string>,
): ExerciseSummary[] {
  return swapCandidates(target, list, exclude)
}

/** Equipment values present in the library, most common first. */
export function equipmentValues(list: readonly ExerciseSummary[]): string[] {
  const counts = new Map<string, number>()
  for (const e of list) if (e.equipment) counts.set(e.equipment, (counts.get(e.equipment) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
}

export function activeFilterCount(f: ExerciseFilter): number {
  return [f.muscle, f.equipment, f.category, f.level].filter((v) => v !== undefined).length
}
