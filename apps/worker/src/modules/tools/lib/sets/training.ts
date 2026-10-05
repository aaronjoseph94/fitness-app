// Owns: the training tools — list_exercises, get_exercise, get_equipment_profile, update_equipment, create_template,
// generate_workout, start_session, log_set, finish_session, get_training_history (the training and workouts-ai
// modules). Templates and workouts written by ai/mcp pass the training guards: allowed exercise set only (machines
// and free weights; no "body only" or floor work), 12–28 sets per session.
import {
  Count,
  EquipmentItem,
  EquipmentUpdate,
  Exercise,
  ExerciseHistory,
  ExerciseQuery,
  Id,
  Instant,
  Kg,
  LocalDate,
  MuscleScores,
  PersonalRecord,
  SessionFinishResult,
  SessionOrigin,
  SessionSet,
  Template,
  TemplateExerciseInput,
  WorkoutDraft,
  WorkoutSession,
} from '@fitness/shared/schemas'
import * as z from 'zod'
import { getJob } from '../../../jobs'
import {
  createTemplate,
  exerciseHistory,
  finishSession,
  getEquipment,
  getExercise,
  getSession,
  listExercises,
  listSessions,
  loadLibrary,
  logSet,
  startSession,
  updateEquipment,
} from '../../../training'
import { requestWorkout } from '../../../workouts-ai'
import { defineTool, type ToolDefinition } from '../define'

/** generate_workout waits this long for the job (it runs after the call starts), polling once a second. */
const WORKOUT_WAIT_MS = 20_000
const POLL_MS = 1_000

const ExerciseBrief = Exercise.pick({
  id: true,
  name: true,
  category: true,
  equipment: true,
  mechanic: true,
  level: true,
  primary_muscles: true,
  secondary_muscles: true,
  allowed: true,
}).extend({ excluded_reason: z.string().nullable() })

const Rpe = z.number().min(6).max(10).multipleOf(0.5)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const HistorySession = z.object({
  id: Id,
  date: LocalDate,
  origin: SessionOrigin,
  template_id: Id.nullable(),
  started_at: Instant,
  ended_at: Instant.nullable(),
  sets_done: Count,
  volume_kg: z.number(),
  muscle_scores: MuscleScores.nullable(),
  prs: z.array(PersonalRecord),
  /** Completed sets per exercise as "reps×kg" (with "@RPE" when logged). */
  exercises: z.array(z.object({ exercise_id: Id, name: z.string(), sets: z.array(z.string()) })),
})

export const TRAINING_TOOLS: readonly ToolDefinition[] = [
  defineTool({
    name: 'list_exercises',
    title: 'List exercises',
    area: 'training',
    description:
      'Search the exercise library. By default only the allowed exercise set (what the equipment profile and exclusions permit; the only exercises any workout may use). Filter by primary muscle (17 keys: abdominals, abductors, adductors, biceps, calves, chest, forearms, glutes, hamstrings, lats, lower back, middle back, neck, quadriceps, shoulders, traps, triceps), equipment, category, level or name words. Returns compact entries; use get_exercise for instructions and media. Read-only.',
    input: ExerciseQuery.extend({ limit: z.number().int().min(1).max(200).default(40) }),
    output: z.object({ exercises: z.array(ExerciseBrief), total: Count }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    run: async (deps, { limit, ...query }) => {
      const all = await listExercises(deps, query)
      return {
        total: all.length,
        exercises: all.slice(0, limit).map((e) => ({
          id: e.id,
          name: e.name,
          category: e.category,
          equipment: e.equipment,
          mechanic: e.mechanic,
          level: e.level,
          primary_muscles: e.primary_muscles,
          secondary_muscles: e.secondary_muscles,
          allowed: e.allowed,
          excluded_reason: e.excluded_reason ?? null,
        })),
      }
    },
  }),
  defineTool({
    name: 'get_exercise',
    title: 'Get an exercise',
    area: 'training',
    description:
      'One exercise in full: muscles (primary and secondary), equipment, step-by-step instructions, image paths, video search link, whether it is in the allowed set and why not. Read-only.',
    input: z.object({ id: Id }),
    output: Exercise,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    run: (deps, { id }) => getExercise(deps, id),
  }),
  defineTool({
    name: 'get_equipment_profile',
    title: 'Get the equipment profile',
    area: 'training',
    description:
      "Aaron's equipment at Anytime Fitness: every library equipment value and named machine with its status (have, dont_have, dislike, cant_use) and note (e.g. \"left shoulder\"). Anything not 'have' takes its exercises out of the allowed set. Read-only.",
    input: z.object({}),
    output: z.object({ items: z.array(EquipmentItem) }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    run: async (deps) => ({ items: await getEquipment(deps) }),
  }),
  defineTool({
    name: 'update_equipment',
    title: 'Update equipment statuses',
    area: 'training',
    description:
      'Set the status (have, dont_have, dislike, cant_use) and optional note of equipment or named machines (matched by name, case-insensitive; a new name is added as a machine). This changes the allowed exercise set for every future workout. Only when Aaron tells you what he has or avoids.',
    input: EquipmentUpdate,
    output: z.object({ items: z.array(EquipmentItem) }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: async (deps, input) => ({ items: await updateEquipment(deps, input) }),
  }),
  defineTool({
    name: 'create_template',
    title: 'Create a workout template',
    area: 'training',
    description:
      'Save a reusable workout template: ordered exercises (ids from list_exercises, allowed set only) with sets, rep range, target load kg (null = let progression pick), rest seconds and a note. Guarded: allowed exercises only and 12–28 sets in total, else it fails with the rule. Returns the template with its muscle scores.',
    input: z.object({
      name: z.string().trim().min(1).max(100),
      notes: z.string().max(1000).optional(),
      exercises: z.array(TemplateExerciseInput).min(1).max(20),
    }),
    output: Template,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: (deps, i) =>
      createTemplate(deps, {
        id: crypto.randomUUID(),
        name: i.name,
        origin: 'ai',
        notes: i.notes,
        exercises: i.exercises,
      }),
  }),
  defineTool({
    name: 'generate_workout',
    title: 'Generate a workout',
    area: 'training',
    description:
      "Ask the app's workout generator for one session for a date: mode 'generate' (optional focus such as \"arms\") or 'fill' (complete a partial exercise list into a balanced session). It uses the allowed set, readiness (sleep, steps, days since the last session), recovery, deload and history, sets loads by progression, and stores the draft as a pending workout proposal Aaron can start from the Train tab. Waits up to 20 s; if still running, returns the job id and the draft appears in the app.",
    input: z.object({
      mode: z.enum(['generate', 'fill']).default('generate'),
      date: LocalDate.optional().describe('Default today'),
      focus: z.string().max(200).optional(),
      exercises: z
        .array(TemplateExerciseInput)
        .min(1)
        .max(20)
        .optional()
        .describe("Required for mode 'fill'"),
    }),
    output: z.object({
      job_id: Id,
      status: z.enum(['done', 'failed', 'running']),
      draft: WorkoutDraft.nullable(),
      error: z.string().nullable(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: async (deps, i) => {
      const { job_id } =
        i.mode === 'fill'
          ? await requestWorkout(deps, { mode: 'fill', date: i.date, exercises: i.exercises ?? [] })
          : await requestWorkout(deps, { mode: 'generate', date: i.date, focus: i.focus })
      const started = Date.now()
      while (Date.now() - started < WORKOUT_WAIT_MS) {
        await sleep(POLL_MS)
        const job = await getJob(deps, job_id)
        if (job.status === 'done') {
          const draft = WorkoutDraft.safeParse(job.result)
          return {
            job_id,
            status: 'done' as const,
            draft: draft.success ? draft.data : null,
            error: draft.success ? null : 'unreadable draft',
          }
        }
        if (job.status === 'failed')
          return { job_id, status: 'failed' as const, draft: null, error: job.error }
      }
      return { job_id, status: 'running' as const, draft: null, error: null }
    },
  }),
  defineTool({
    name: 'start_session',
    title: 'Start a gym session',
    area: 'training',
    description:
      "Start a session now (or at started_at): from a template (template_id), from a pending AI workout proposal (proposal_id, which accepts it), from today's week-plan session (use_week_plan), from an explicit exercise list, or blank. Returns the session with its plan: last session's sets per exercise, the progression default load, recovery notes and deload status. Then log_set and finish_session.",
    input: z.object({
      template_id: Id.optional(),
      proposal_id: Id.optional(),
      use_week_plan: z.boolean().optional(),
      exercises: z.array(TemplateExerciseInput).min(1).max(20).optional(),
      started_at: Instant.optional(),
    }),
    output: WorkoutSession,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: (deps, i) => {
      const origin = i.proposal_id
        ? 'ai'
        : i.template_id
          ? 'template'
          : i.use_week_plan
            ? 'week_plan'
            : i.exercises
              ? 'ai'
              : 'blank'
      return startSession(deps, {
        id: crypto.randomUUID(),
        template_id: i.template_id ?? null,
        origin,
        started_at: i.started_at ?? deps.now().toISOString(),
        exercises: i.exercises,
        proposal_id: i.proposal_id,
      })
    },
  }),
  defineTool({
    name: 'log_set',
    title: 'Log a set',
    area: 'training',
    description:
      'Log one set of an exercise in a session: reps, load kg, optional RPE (6–10 in half steps), done (default true). set_index defaults to the next index for that exercise in the session. Only what Aaron reports.',
    input: z.object({
      session_id: Id,
      exercise_id: Id,
      reps: Count.max(100).optional(),
      load_kg: Kg.optional(),
      rpe: Rpe.optional(),
      completed: z.boolean().default(true),
      set_index: Count.max(50).optional(),
      note: z.string().max(200).optional(),
    }),
    output: SessionSet,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: async (deps, { session_id, set_index, ...set }) => {
      let index = set_index
      if (index === undefined) {
        const session = await getSession(deps, session_id)
        const mine = session.sets.filter((s) => s.exercise_id === set.exercise_id).map((s) => s.set_index)
        index = mine.length ? Math.max(...mine) + 1 : 0
      }
      return logSet(deps, session_id, { id: crypto.randomUUID(), set_index: index, ...set })
    },
  }),
  defineTool({
    name: 'finish_session',
    title: 'Finish a session',
    area: 'training',
    description:
      'Finish a session (at ended_at, default now): returns duration, total volume, volume and muscle score per muscle, and the PRs detected (best load at a rep count, best Epley e1RM).',
    input: z.object({ id: Id, ended_at: Instant.optional(), notes: z.string().max(2000).optional() }),
    output: SessionFinishResult,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, i) =>
      finishSession(deps, i.id, { ended_at: i.ended_at ?? deps.now().toISOString(), notes: i.notes }),
  }),
  defineTool({
    name: 'get_training_history',
    title: 'Get training history',
    area: 'training',
    description:
      "Sessions between two dates (newest first, at most 120 days), each with its completed sets per exercise as reps×kg, volume, muscle scores and PRs. With exercise_id: that exercise's entries in the range, its PRs and the engine's next-session suggestion (double progression or deload). Read-only.",
    input: z
      .object({ from: LocalDate, to: LocalDate, exercise_id: Id.optional() })
      .refine((r) => r.from <= r.to, { message: '`from` must be on or before `to`', path: ['to'] })
      .refine((r) => Date.parse(r.to) - Date.parse(r.from) <= 120 * 86_400_000, {
        message: 'At most 120 days',
        path: ['to'],
      }),
    output: z.object({ sessions: z.array(HistorySession), exercise: ExerciseHistory.nullable() }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    run: async (deps, i) => {
      const [sessions, library, history] = await Promise.all([
        listSessions(deps, { from: i.from, to: i.to }),
        loadLibrary(deps),
        i.exercise_id ? exerciseHistory(deps, i.exercise_id) : Promise.resolve(null),
      ])
      const name = (id: string) => library.byId.get(id)?.name ?? 'Exercise'
      return {
        sessions: sessions.map((s) => {
          const done = s.sets.filter((x) => x.completed)
          const byExercise = new Map<string, string[]>()
          for (const x of [...done].sort((a, b) => a.set_index - b.set_index))
            byExercise.set(x.exercise_id, [
              ...(byExercise.get(x.exercise_id) ?? []),
              `${x.reps ?? '?'}×${x.load_kg ?? 0}${x.rpe ? `@${x.rpe}` : ''}`,
            ])
          return {
            id: s.id,
            date: s.date,
            origin: s.origin,
            template_id: s.template_id,
            started_at: s.started_at,
            ended_at: s.ended_at,
            sets_done: done.length,
            volume_kg: Math.round(done.reduce((v, x) => v + (x.reps ?? 0) * (x.load_kg ?? 0), 0)),
            muscle_scores: s.muscle_scores,
            prs: s.prs ?? [],
            exercises: [...byExercise.entries()].map(([exercise_id, sets]) => ({
              exercise_id,
              name: name(exercise_id),
              sets,
            })),
          }
        }),
        exercise: history
          ? { ...history, entries: history.entries.filter((e) => e.date >= i.from && e.date <= i.to) }
          : null,
      }
    },
  }),
]
