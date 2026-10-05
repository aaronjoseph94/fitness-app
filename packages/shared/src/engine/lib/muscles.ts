// Owns: what a workout trains and lifts (SPEC §7) — muscle scores and their map levels, session volume (total and per
// muscle), Epley e1RM and PR detection against history, rolled up into the session-finish summary.
import { Muscle, type LocalDate } from '../../schemas/common'
import type { ExerciseInfo } from './types'

/** Weight of a muscle in an exercise's score and volume: 1.0 when primary, 0.5 when secondary (SPEC §7). */
const PRIMARY = 1
const SECONDARY = 0.5

type MuscleTags = Pick<ExerciseInfo, 'primary_muscles' | 'secondary_muscles'>

/** A value per muscle; an absent muscle is 0 (structurally `MuscleScores`). */
export type MuscleValues = Partial<Record<Muscle, number>>

/** Map intensity per muscle: 0 = untrained, 1–4 = quantile of the trained muscles' scores. */
export type MuscleLevel = 0 | 1 | 2 | 3 | 4

function addWeighted(into: MuscleValues, tags: MuscleTags, amount: number): void {
  for (const m of tags.primary_muscles) into[m] = (into[m] ?? 0) + amount * PRIMARY
  for (const m of tags.secondary_muscles) into[m] = (into[m] ?? 0) + amount * SECONDARY
}

/** score(muscle) = Σ over exercises of sets × (1.0 if the muscle is primary, 0.5 if secondary). */
export function muscleScores(exercises: readonly (MuscleTags & { sets: number })[]): MuscleValues {
  const scores: MuscleValues = {}
  for (const e of exercises) addWeighted(scores, e, e.sets)
  return scores
}

/**
 * Map level per muscle. For the n muscles with score > 0: p(x) = |{trained scores ≤ x}| / n (empirical quantile),
 * level = ⌈4 × p(x)⌉ ∈ 1…4. Score 0 or absent → 0. The top-scoring muscle is always 4.
 */
export function muscleLevels(scores: MuscleValues): Record<Muscle, MuscleLevel> {
  const trained = Muscle.options.map((m) => scores[m] ?? 0).filter((s) => s > 0)
  const levels = {} as Record<Muscle, MuscleLevel>
  for (const m of Muscle.options) {
    const s = scores[m] ?? 0
    levels[m] = s > 0 ? (Math.max(1, Math.ceil((4 * trained.filter((t) => t <= s).length) / trained.length)) as MuscleLevel) : 0
  }
  return levels
}

/** Epley estimated one-rep max: e1RM = load × (1 + reps / 30). */
export function e1rm(load_kg: number, reps: number): number {
  return load_kg * (1 + reps / 30)
}

/** A set as logged (structurally a subset of `SessionSet`). */
export type SessionSetLike = { exercise_id: string; reps: number | null; load_kg: number | null; completed: boolean }

/** Structurally a `PersonalRecord`. */
export type PrRecord = {
  exercise_id: string
  kind: 'best_load_at_reps' | 'best_e1rm'
  reps: number
  load_kg: number
  e1rm_kg: number
  /** best_load_at_reps: the previous best load at ≥ reps; best_e1rm: the previous best e1RM. Null when none. */
  previous_best_kg: number | null
  date: LocalDate
}

export type SessionSummaryInput = {
  date: LocalDate
  started_at: string
  ended_at: string
  sets: readonly SessionSetLike[]
  exercises: readonly (MuscleTags & { id: string })[]
  /** Sets of earlier sessions (any exercises) for PR detection. */
  history: readonly SessionSetLike[]
}

/** Structurally a `SessionSummary`. */
export type SessionTotals = {
  duration_min: number
  total_volume_kg: number
  volume_by_muscle: MuscleValues
  muscle_scores: MuscleValues
  prs: PrRecord[]
}

type Lift = { exercise_id: string; reps: number; load_kg: number }

function lifts(sets: readonly SessionSetLike[]): Lift[] {
  return sets.flatMap((s) =>
    s.completed && s.reps !== null && s.reps > 0 && s.load_kg !== null && s.load_kg > 0
      ? [{ exercise_id: s.exercise_id, reps: s.reps, load_kg: s.load_kg }]
      : [],
  )
}

/**
 * The session-finish numbers (SPEC §7), over completed sets with reps and load:
 *   duration_min     = round((ended_at − started_at) / 60 s)
 *   total_volume_kg  = Σ reps × load
 *   volume_by_muscle = Σ reps × load × (1.0 primary, 0.5 secondary)
 *   muscle_scores    = muscleScores with sets = completed sets per exercise
 *   prs              = detectPrs against history
 */
export function sessionSummary(input: SessionSummaryInput): SessionTotals {
  const tags = new Map(input.exercises.map((e) => [e.id, e]))
  const done = lifts(input.sets)
  const volume_by_muscle: MuscleValues = {}
  let total = 0
  for (const l of done) {
    total += l.reps * l.load_kg
    const t = tags.get(l.exercise_id)
    if (t) addWeighted(volume_by_muscle, t, l.reps * l.load_kg)
  }
  const setsPerExercise = new Map<string, number>()
  for (const s of input.sets) if (s.completed) setsPerExercise.set(s.exercise_id, (setsPerExercise.get(s.exercise_id) ?? 0) + 1)
  const muscle_scores = muscleScores(
    [...setsPerExercise].flatMap(([id, sets]) => {
      const t = tags.get(id)
      return t ? [{ ...t, sets }] : []
    }),
  )
  const minutes = (Date.parse(input.ended_at) - Date.parse(input.started_at)) / 60_000
  return {
    duration_min: Math.max(0, Math.round(minutes)),
    total_volume_kg: total,
    volume_by_muscle,
    muscle_scores,
    prs: detectPrs(done, lifts(input.history), input.date),
  }
}

/**
 * PRs of one session against history, per exercise that has history (a first session sets the baseline, no PRs):
 *   best load at a rep count: a set (r, L) not matched by another of today's sets with ≥ r reps and ≥ L kg, where
 *     L > max load over history sets with ≥ r reps (previous_best null when history has none with that many reps)
 *   best e1RM: max today of load × (1 + reps / 30) > max over history
 */
function detectPrs(today: readonly Lift[], history: readonly Lift[], date: LocalDate): PrRecord[] {
  const prs: PrRecord[] = []
  for (const exercise_id of new Set(today.map((l) => l.exercise_id))) {
    const past = history.filter((l) => l.exercise_id === exercise_id)
    if (past.length === 0) continue
    const now = today.filter((l) => l.exercise_id === exercise_id)

    const seenReps = new Set<number>()
    for (const l of now) {
      if (seenReps.has(l.reps)) continue
      const dominated = now.some((o) => o !== l && o.reps >= l.reps && o.load_kg >= l.load_kg && (o.reps > l.reps || o.load_kg > l.load_kg))
      const best = now.filter((o) => o.reps === l.reps).reduce((m, o) => Math.max(m, o.load_kg), 0)
      if (dominated || l.load_kg < best) continue
      seenReps.add(l.reps)
      const atLeast = past.filter((p) => p.reps >= l.reps)
      const previous = atLeast.length ? Math.max(...atLeast.map((p) => p.load_kg)) : null
      if (previous === null || l.load_kg > previous)
        prs.push({ exercise_id, kind: 'best_load_at_reps', reps: l.reps, load_kg: l.load_kg, e1rm_kg: e1rm(l.load_kg, l.reps), previous_best_kg: previous, date })
    }

    const top = now.reduce((a, b) => (e1rm(b.load_kg, b.reps) > e1rm(a.load_kg, a.reps) ? b : a))
    const previousE1rm = Math.max(...past.map((p) => e1rm(p.load_kg, p.reps)))
    if (e1rm(top.load_kg, top.reps) > previousE1rm)
      prs.push({ exercise_id, kind: 'best_e1rm', reps: top.reps, load_kg: top.load_kg, e1rm_kg: e1rm(top.load_kg, top.reps), previous_best_kg: previousE1rm, date })
  }
  return prs
}
