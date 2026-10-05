// Owns: turning the LLM's picks into a draft that passes the guards — deterministically, recording every drop and
// repair as a guard note. Pure (no I/O): the library, guard context and limits come in as data.
//
// Steps, in order:
//   1. kept exercises (fill: Aaron's partial list) first, then the LLM's picks
//   2. map each id (library slug or UUID) to the library; unknown → dropped
//   3. a second pick of the same exercise → dropped
//   4. engine guards per exercise (allowed set, no excluded category) → dropped with the exclusion's reason
//   5. recovery: an LLM pick whose primary muscle is in `avoid` → dropped (kept exercises stay, with a note)
//   6. at most 10 exercises (extra LLM picks from the end dropped)
//   7. rep range clamped to 1–30 (swapped when min > max), rest to 30–300 s, LLM sets to 1–6, load rounded to 0.5 kg
//      (applied while resolving, before step 2)
//   8. total sets into [min, max]: while above, −1 set on the exercise with the most sets (ties: the later one);
//      while below, +1 on the one with the fewest sets under 6 (ties: the earlier one); no room → RepairError
//   9. the whole workout through the engine guards (12–28 sets, allowed ids) — must pass, else RepairError
import { applyGuards, type ExerciseSwapChange, type GuardContext, type WorkoutChange } from '@fitness/shared/engine'
import type { Muscle, TemplateExerciseInput } from '@fitness/shared/schemas'
import type { LibraryEntry } from '../../training'
import type { LlmWorkout } from './plan'

/** The draft could not be repaired into a valid workout (the job retries with a fresh LLM call). */
export class RepairError extends Error {}

const MAX_EXERCISES = 10
const MAX_SETS_PER_PICK = 6

export interface RepairInput {
  picks: LlmWorkout['exercises']
  keep: readonly TemplateExerciseInput[]
  byId: ReadonlyMap<string, LibraryEntry>
  bySlug: ReadonlyMap<string, LibraryEntry>
  guard: GuardContext
  avoid: readonly Muscle[]
  sets: { min: number; max: number }
}

export interface RepairResult {
  exercises: TemplateExerciseInput[]
  notes: string[]
}

type Item = { entry: LibraryEntry; plan: TemplateExerciseInput; kept: boolean; raw_sets: number }

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

export function repairDraft(input: RepairInput): RepairResult {
  const notes: string[] = []
  const drop = (what: string, why: string) => notes.push(`Dropped ${what}: ${why}`)

  // 1–3. resolve and dedupe
  const items: Item[] = []
  const add = (raw: string, plan: Omit<TemplateExerciseInput, 'exercise_id'>, kept: boolean, raw_sets: number) => {
    const entry = input.byId.get(raw) ?? input.bySlug.get(raw) ?? input.bySlug.get(raw.toLowerCase())
    if (!entry) return drop(`"${raw}"`, 'not in the exercise library')
    const twin = items.find((i) => i.entry.id === entry.id)
    if (twin) return twin.kept || kept ? undefined : drop(entry.name, 'listed twice') // the LLM echoing a kept one is fine
    items.push({ entry, plan: { ...plan, exercise_id: entry.id }, kept, raw_sets })
  }
  for (const k of input.keep) add(k.exercise_id, k, true, k.sets)
  for (const p of input.picks) {
    const rep_min = clamp(Math.min(p.rep_min, p.rep_max), 1, 30)
    const rep_max = clamp(Math.max(p.rep_min, p.rep_max), 1, 30)
    add(
      p.exercise_id,
      {
        sets: clamp(p.sets, 1, MAX_SETS_PER_PICK),
        rep_min,
        rep_max,
        target_load_kg: p.load_kg && p.load_kg > 0 ? Math.round(p.load_kg * 2) / 2 : null,
        rest_sec: clamp(p.rest_sec, 30, 300),
        note: null,
      },
      false,
      p.sets,
    )
  }

  // 4. allowed set and excluded categories, per exercise (engine guards)
  const checked = applyGuards<ExerciseSwapChange>(
    items.map((i) => ({ kind: 'exercise_swap', from_exercise_id: i.entry.id, to_exercise_id: i.entry.id })),
    input.guard,
  )
  const rejected = new Map(checked.rejected.map((r) => [r.change.to_exercise_id, r]))
  let kept = items.filter((i) => {
    const r = rejected.get(i.entry.id)
    if (r) drop(i.entry.name, i.entry.excluded_reason ?? (r.rule === 'excluded_category' ? 'in an excluded category' : 'not in the allowed exercise set'))
    return !r
  })

  // 5. recovery rule
  kept = kept.filter((i) => {
    const hit = i.entry.primary_muscles.filter((m) => input.avoid.includes(m))
    if (!hit.length) return true
    if (i.kept) {
      notes.push(`Kept ${i.entry.name}, though ${hit.join(', ')} ${hit.length > 1 ? 'are' : 'is'} a primary target on a neighbouring day`)
      return true
    }
    drop(i.entry.name, `${hit.join(', ')} ${hit.length > 1 ? 'were' : 'was'} a primary target on a neighbouring day (recovery)`)
    return false
  })

  // 6. exercise count
  while (kept.length > MAX_EXERCISES) {
    const last = kept.map((i) => i.kept).lastIndexOf(false)
    const at = last >= 0 ? last : kept.length - 1
    drop(kept[at]!.entry.name, `more than ${MAX_EXERCISES} exercises`)
    kept.splice(at, 1)
  }
  if (kept.length === 0) throw new RepairError(`No usable exercises left (${notes.join('; ')})`)

  // 8. total sets
  const plans = kept.map((i) => ({ ...i.plan }))
  const total = () => plans.reduce((n, p) => n + p.sets, 0)
  const before = kept.reduce((n, i) => n + i.raw_sets, 0)
  while (total() > input.sets.max) {
    let at = -1
    plans.forEach((p, i) => {
      if (p.sets > 1 && (at < 0 || p.sets >= plans[at]!.sets)) at = i
    })
    if (at < 0) throw new RepairError(`Cannot fit ${plans.length} exercises into ${input.sets.max} sets`)
    plans[at]!.sets--
  }
  while (total() < input.sets.min) {
    let at = -1
    plans.forEach((p, i) => {
      if (p.sets < MAX_SETS_PER_PICK && (at < 0 || p.sets < plans[at]!.sets)) at = i
    })
    if (at < 0) throw new RepairError(`${plans.length} exercises cannot reach ${input.sets.min} sets`)
    plans[at]!.sets++
  }
  if (total() !== before) notes.push(`Sets ${total() < before ? 'trimmed' : 'raised'} from ${before} to ${total()} (limit ${input.sets.min}–${input.sets.max})`)

  // 9. the whole workout through the guards
  const final = applyGuards<WorkoutChange>([{ kind: 'workout', exercises: plans }], input.guard)
  if (final.rejected.length) throw new RepairError(final.rejected.map((r) => r.reason).join('; '))
  return { exercises: plans, notes }
}
