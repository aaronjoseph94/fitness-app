// Owns: training rows ↔ contract shapes — exercises (gif from the column or its media list, the video search link),
// sets, sessions, templates, and the session start plan kept in `workout_sessions.plan` (the planned exercises, the
// recovery rule and the deload check at start; `workout_sessions.readiness` holds only the readiness score). Sessions
// stored before that column existed kept the start plan beside the Readiness fields; startPlan reads both.
import {
  DeloadStatus,
  PersonalRecord,
  Readiness,
  SessionRecovery,
  TemplateExerciseInput,
  type Exercise,
  type SessionSet,
  type Template,
  type WorkoutSession,
} from '@fitness/shared/schemas'
import * as z from 'zod'
import type { exercises, Row, session_sets, template_exercises, workout_sessions, workout_templates } from '../../../db'

export type ExerciseRow = Row<typeof exercises>
export type SetRow = Row<typeof session_sets>
export type SessionRow = Row<typeof workout_sessions>
export type TemplateRow = Row<typeof workout_templates>
export type TemplateExerciseRow = Row<typeof template_exercises>

/** What the engine needs about an exercise (structurally ExerciseInfo minus `allowed`). */
export type ExerciseTags = Pick<
  ExerciseRow,
  'id' | 'slug' | 'name' | 'category' | 'equipment' | 'mechanic' | 'level' | 'primary_muscles' | 'secondary_muscles'
>

/** YouTube search for "<name> form" (SPEC §7); same as @fitness/exercises videoSearchUrl (not imported: 1 MB JSON). */
export const videoSearchUrl = (name: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} form`)}`

/** 'Pendulum Squat (club)' → 'pendulum-squat-club'. */
export const toSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export function toExercise(row: ExerciseRow, excluded_reason: string | null): Exercise {
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    slug: row.slug,
    name: row.name,
    category: row.category,
    equipment: row.equipment,
    mechanic: row.mechanic,
    force: row.force,
    level: row.level,
    primary_muscles: row.primary_muscles,
    secondary_muscles: row.secondary_muscles,
    instructions: row.instructions,
    image_paths: row.image_paths,
    video_search_url: row.video_search_url ?? videoSearchUrl(row.name),
    gif_url: row.gif_url ?? row.media?.find((m) => m.kind === 'gif')?.url ?? null,
    source: row.custom ? 'user' : row.source,
    allowed: excluded_reason === null,
    excluded_reason,
  }
}

export function toSessionSet(row: SetRow): SessionSet {
  return {
    id: row.id,
    session_id: row.session_id,
    exercise_id: row.exercise_id,
    set_index: row.set_index,
    reps: row.reps,
    load_kg: row.load_kg,
    rpe: row.rpe,
    completed: row.completed,
    note: row.note,
  }
}

/** `workout_sessions.plan`: what a session started from (see the file header). */
export const StartPlan = z.object({
  exercises: z.array(TemplateExerciseInput),
  recovery: SessionRecovery,
  deload: DeloadStatus,
})
export type StartPlan = z.infer<typeof StartPlan>

/** Sessions stored before `workout_sessions.plan`: the start plan beside the Readiness fields in `readiness`. */
const LegacyStartRecord = Readiness.extend({
  plan: z.array(TemplateExerciseInput).default([]),
  recovery: SessionRecovery.optional(),
  deload: DeloadStatus.optional(),
})

/** The start plan of a session row (recovery/deload null on old rows that lack them); null when none was stored. */
export function startPlan(
  row: Pick<SessionRow, 'plan' | 'readiness'>,
): { exercises: TemplateExerciseInput[]; recovery: SessionRecovery | null; deload: DeloadStatus | null } | null {
  if (row.plan !== null) {
    const parsed = StartPlan.safeParse(row.plan)
    return parsed.success ? parsed.data : null
  }
  const legacy = LegacyStartRecord.safeParse(row.readiness)
  return legacy.success ? { exercises: legacy.data.plan, recovery: legacy.data.recovery ?? null, deload: legacy.data.deload ?? null } : null
}

/** The readiness score a session started with (extra keys on old rows stripped); null when none was stored. */
export function startReadiness(row: Pick<SessionRow, 'readiness'>): Readiness | null {
  const parsed = Readiness.safeParse(row.readiness)
  return parsed.success ? parsed.data : null
}

const PrList = z.array(PersonalRecord)

export function toWorkoutSession(row: SessionRow, sets: readonly SetRow[]): WorkoutSession {
  const readiness = startReadiness(row)
  const prs = PrList.safeParse(row.prs)
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    date: row.date,
    template_id: row.template_id,
    started_at: row.started_at,
    ended_at: row.ended_at,
    origin: row.origin,
    readiness,
    notes: row.notes,
    muscle_scores: row.muscle_scores ?? null,
    prs: prs.success ? prs.data : null,
    sets: [...sets].sort(bySetOrder).map(toSessionSet),
  }
}

/** Sets in logging order: by created_at, then set_index. */
export const bySetOrder = (a: SetRow, b: SetRow) =>
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.set_index - b.set_index

export function toTemplate(row: TemplateRow, items: readonly TemplateExerciseRow[]): Template {
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    name: row.name,
    origin: row.origin,
    notes: row.notes,
    muscle_scores: row.muscle_scores ?? {},
    exercises: [...items]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((e) => ({
        id: e.id,
        exercise_id: e.exercise_id,
        sets: e.sets,
        rep_min: e.rep_min,
        rep_max: e.rep_max,
        target_load_kg: e.target_load_kg,
        rest_sec: e.rest_sec ?? 90,
        note: e.note,
      })),
  }
}

/** Unique values in first-seen order. */
export const unique = <T>(xs: Iterable<T>): T[] => [...new Set(xs)]

export { chunk } from '../../../db'

export const round = (x: number, dp = 1) => Math.round(x * 10 ** dp) / 10 ** dp

