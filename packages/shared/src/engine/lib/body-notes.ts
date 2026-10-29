// Owns: what body notes mean for training — which notes are active on a day, and what they steer: the muscles a
// generated workout must not load, and whether volume drops. Pure; the worker loads the rows.
import type { Muscle } from '../../schemas/common'
import { addDays } from './dates'

/** Structurally a `BodyNote` (only what the rules read). */
export interface BodyNoteInput {
  date: string
  area: string
  kind: 'pain' | 'soreness' | 'energy' | 'illness' | 'mood'
  severity: number
  resolved_on: string | null
}

/** Days a note stays active after its date (BODY_NOTE_DAYS in the schema). */
const ACTIVE_DAYS = 7

/** The muscles a joint note protects: those that load the joint in a machine or free-weight lift. */
const JOINT_MUSCLES: Record<string, readonly Muscle[]> = {
  knee: ['quadriceps', 'hamstrings'],
  hip: ['glutes', 'abductors', 'adductors'],
  ankle: ['calves'],
  shoulder_joint: ['shoulders', 'chest'],
  elbow: ['biceps', 'triceps', 'forearms'],
  wrist: ['forearms'],
  neck_joint: ['neck', 'traps'],
  spine: ['lower back', 'middle back'],
}

/**
 * A note is active on `day` when date ≤ day ≤ date + 7 and it is not resolved on or before `day`.
 *   active(n, day) = n.date ≤ day ∧ day ≤ n.date + 7 ∧ (n.resolved_on = null ∨ n.resolved_on > day)
 */
export function activeBodyNotes<T extends BodyNoteInput>(notes: readonly T[], day: string): T[] {
  return notes.filter(
    (n) =>
      n.date <= day && day <= addDays(n.date, ACTIVE_DAYS) && (n.resolved_on === null || n.resolved_on > day),
  )
}

/**
 * What active notes steer:
 *   avoid          = ⋃ muscles of every pain note, and of soreness with severity ≥ 2 (a joint → JOINT_MUSCLES[joint])
 *   reduced_volume = any illness ∨ energy with severity ≥ 2 ∨ any note with severity 3
 * Mood notes are kept for the coach but steer nothing.
 */
export function bodyNoteSteer(active: readonly BodyNoteInput[]): { avoid: Muscle[]; reduced_volume: boolean } {
  const avoid = new Set<Muscle>()
  let reduced = false
  for (const n of active) {
    if (n.kind === 'illness' || (n.kind === 'energy' && n.severity >= 2) || n.severity >= 3) reduced = true
    if (n.kind === 'pain' || (n.kind === 'soreness' && n.severity >= 2)) {
      for (const m of JOINT_MUSCLES[n.area] ?? (n.area === 'whole_body' ? [] : [n.area as Muscle])) avoid.add(m)
    }
  }
  return { avoid: [...avoid].sort(), reduced_volume: reduced }
}
