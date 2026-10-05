// Owns: the training rules the engine (not the LLM) decides (SPEC §7) — double progression per exercise, the deload
// proposal, and the recovery rule (no muscle as a primary target on consecutive days).
import type { LocalDate, Muscle } from '../../schemas/common'
import { addDays, daysBetween } from './dates'

/** Share of sets kept in a deload week (SPEC §7). */
export const DELOAD_SETS_FACTOR = 0.6
/** A deload is proposed this many weeks after the last one (SPEC §7: every 6–8 weeks). */
export const DELOAD_EVERY_WEEKS = 6

const LOWER_BODY: ReadonlySet<Muscle> = new Set(['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'])
/** Library equipment loaded by hand, not by a stack. Anything else (machine, cable, a named machine) is a stack. */
const FREE_WEIGHT: ReadonlySet<string> = new Set(['barbell', 'dumbbell', 'e-z curl bar', 'kettlebells', 'medicine ball', 'bands', 'exercise ball', 'foam roll', 'body only', 'other'])

/** One logged set (structurally a subset of `SessionSet`). */
export type LoggedSet = { reps: number | null; load_kg: number | null; completed: boolean }

export type ProgressionInput = {
  exercise: { primary_muscles: readonly Muscle[]; equipment: string | null }
  /** The rep range and set count of the template / plan. */
  rep_min: number
  rep_max: number
  sets: number
  /**
   * This exercise's past sessions (any order). `started_at` (UTC instant) orders two sessions on one local date; without
   * it they keep the order given.
   */
  history: readonly { date: LocalDate; started_at?: string; sets: readonly LoggedSet[] }[]
  /** The program is in a deload week (see deloadCheck). */
  deload_week?: boolean
}

/** Structurally a `ProgressionSuggestion`: the greyed default for the next session. */
export type Progression = { kind: 'increase' | 'hold' | 'deload'; load_kg: number | null; sets: number | null; reason: string }

/**
 * Load increment: dumbbells +2.5 kg; lower body (a primary muscle in quadriceps, hamstrings, glutes, calves,
 * adductors, abductors) +5 kg; machines and cables (stack) +5 kg; other upper-body free weights +2.5 kg.
 */
function increment(exercise: ProgressionInput['exercise']): number {
  const equipment = exercise.equipment?.toLowerCase() ?? null
  if (equipment === 'dumbbell') return 2.5
  if (exercise.primary_muscles.some((m) => LOWER_BODY.has(m))) return 5
  if (equipment !== null && !FREE_WEIGHT.has(equipment)) return 5
  return 2.5
}

/** A session's working sets: completed, with reps and load logged. */
function working(sets: readonly LoggedSet[]): { reps: number; load_kg: number }[] {
  return sets.flatMap((s) => (s.completed && s.reps !== null && s.load_kg !== null ? [{ reps: s.reps, load_kg: s.load_kg }] : []))
}

/**
 * Double progression (SPEC §7):
 *   sessions in order of (date, started_at); last = the latest
 *   session load L = min load over its working sets; the session "tops out" when it has ≥ `sets` working sets and
 *   every one has reps ≥ rep_max.
 *   last two sessions both top out at the same L → increase: L + increment
 *   otherwise → hold at the last session's L
 *   deload week → deload: same L, round(sets × 0.6) sets (at least 1)
 */
export function nextProgression(input: ProgressionInput): Progression {
  const order = (a: { date: string; started_at?: string }, b: { date: string; started_at?: string }) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.started_at && b.started_at ? a.started_at.localeCompare(b.started_at) : 0
  const sessions = [...input.history]
    .sort(order)
    .map((s) => working(s.sets))
    .filter((w) => w.length > 0)
  const last = sessions.at(-1)
  const load = last ? Math.min(...last.map((s) => s.load_kg)) : null

  if (input.deload_week) {
    const sets = Math.max(1, Math.round(input.sets * DELOAD_SETS_FACTOR))
    return { kind: 'deload', load_kg: load, sets, reason: `Deload week: ${sets} of ${input.sets} sets at the same load` }
  }
  if (!last || load === null) return { kind: 'hold', load_kg: null, sets: input.sets, reason: 'No logged sets yet' }

  const topsOut = (w: { reps: number; load_kg: number }[], at: number) =>
    w.length >= input.sets && w.every((s) => s.reps >= input.rep_max) && Math.abs(Math.min(...w.map((s) => s.load_kg)) - at) < 0.01
  const previous = sessions.at(-2)
  if (previous && topsOut(previous, load) && topsOut(last, load)) {
    const next = load + increment(input.exercise)
    return {
      kind: 'increase',
      load_kg: next,
      sets: input.sets,
      reason: `Every set reached ${input.rep_max} reps at ${load} kg in two sessions running: try ${next} kg`,
    }
  }
  return { kind: 'hold', load_kg: load, sets: input.sets, reason: `Stay at ${load} kg until every set reaches ${input.rep_max} reps twice` }
}

export type DeloadInput = {
  as_of: LocalDate
  /** First day of the last deload week, or null when there has not been one. */
  last_deload_on: LocalDate | null
  /** When the current training block began (counts as the last deload when there has been none). */
  training_started_on: LocalDate
  /** Recent sessions, each set with the rep minimum of its exercise. */
  recent_sessions: readonly { date: LocalDate; sets: readonly { reps: number | null; rep_min: number; completed: boolean }[] }[]
}

export type DeloadCheck = { due: boolean; reason: 'scheduled' | 'missed_reps' | null; weeks_since: number; sets_factor: number }

/**
 * Deload proposal (SPEC §7): one week at 60 % of sets when
 *   scheduled:   ⌊days since (last deload ?? training start) / 7⌋ ≥ 6, or
 *   missed reps: the two latest sessions after the last deload week each miss rep_min on most (> ½) completed sets.
 */
export function deloadCheck(input: DeloadInput): DeloadCheck {
  const since = input.last_deload_on ?? input.training_started_on
  const weeks = Math.floor(daysBetween(since, input.as_of) / 7)
  const after = input.last_deload_on === null ? null : addDays(input.last_deload_on, 6)
  const recent = input.recent_sessions
    .filter((s) => s.date <= input.as_of && (after === null || s.date > after))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(-2)
  const missesMost = (sets: DeloadInput['recent_sessions'][number]['sets']) => {
    const done = sets.filter((s) => s.completed && s.reps !== null)
    return done.length > 0 && done.filter((s) => s.reps! < s.rep_min).length * 2 > done.length
  }
  const reason = weeks >= DELOAD_EVERY_WEEKS ? 'scheduled' : recent.length === 2 && recent.every((s) => missesMost(s.sets)) ? 'missed_reps' : null
  return { due: reason !== null, reason, weeks_since: weeks, sets_factor: DELOAD_SETS_FACTOR }
}

/**
 * Recovery rule (SPEC §7): no muscle group as a primary target on consecutive days.
 *   conflicts = planned primary muscles ∩ primary muscles of sessions on date − 1 or date + 1
 */
export function recoveryConflicts(input: {
  date: LocalDate
  planned_primary: readonly Muscle[]
  sessions: readonly { date: LocalDate; primary_muscles: readonly Muscle[] }[]
}): Muscle[] {
  const neighbours = new Set<Muscle>()
  for (const s of input.sessions)
    if (Math.abs(daysBetween(input.date, s.date)) === 1) for (const m of s.primary_muscles) neighbours.add(m)
  return [...new Set(input.planned_primary)].filter((m) => neighbours.has(m))
}
