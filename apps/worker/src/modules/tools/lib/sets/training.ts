// Owns: the training tools (the training, settings and workouts-ai modules):
// - exercises and sessions ('training'): list_exercises, get_exercise, swap_template_exercise (safe list: applied or
//   proposed), generate_workout, start_session, log_set, finish_session, get_training_history;
// - equipment ('equipment'): get_equipment_profile, update_equipment, hide_exercise;
// - templates ('templates'): list_templates, create_template, update_template, delete_template, revert_train_change;
// - the training week ('week_plans'): get_training_week, set_training_days, plan_training_week.
// Every Train change (templates, equipment, hidden exercises) goes through the training module's trainChange: from Ask AI
// it waits as a train_change proposal for a tap, from Claude (MCP) it applies at once and revert_train_change undoes
// it (Claude only). Training days go through settings proposeTrainingDays, the same way. Templates and workouts written
// by ai/mcp pass the training guards: allowed exercise set only (machines and free weights; no "body only" or floor
// work), 12–28 sets per session. Nothing here un-hides an exercise or edits a logged session.
import {
  Count,
  EquipmentItem,
  Exercise,
  ExerciseHistory,
  ExerciseQuery,
  Id,
  Instant,
  Kg,
  LocalDate,
  Muscle,
  MuscleScores,
  Ok,
  PersonalRecord,
  PlanWeekRequest,
  PlanWeekResult,
  SessionFinishResult,
  SessionOrigin,
  SessionSet,
  Template,
  TemplateExerciseInput,
  TrainChange,
  TrainingWeek,
  Weekday,
  WorkoutDraft,
  WorkoutSession,
} from '@fitness/shared/schemas'
import * as z from 'zod'
import { HttpError } from '../../../../lib/http-error'
import { getJob } from '../../../jobs'
import { proposeTrainingDays } from '../../../settings'
import {
  exerciseHistory,
  finishSession,
  getEquipment,
  getExercise,
  getSession,
  listExercises,
  listSessions,
  listTemplates,
  loadLibrary,
  logSet,
  revertTrainChange,
  startSession,
  swapTemplateExercise,
  trainChange,
} from '../../../training'
import { planTrainingWeek, requestWorkout, trainingWeek } from '../../../workouts-ai'
import { defineTool, safeChangeOutput, type ToolDefinition } from '../define'

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

/** Train changes said once: what Ask AI's call leaves (a card) and what Claude's does (applied, undoable). */
const BEHIND_A_TAP =
  'From the in-app assistant it waits as a proposal card for a tap (status "proposed"; nothing changes until then); ' +
  'from Claude it applies at once (status "applied") and revert_train_change(proposal_id) undoes it.'

const Reason = z.string().trim().min(1).max(300).describe('Why, in one short sentence (e.g. "You asked to rename it")')

/** What one Train change did (training module trainChange). */
const TrainChangeOutput = z.object({
  status: z.enum(['applied', 'proposed']),
  proposal_id: Id.describe('The change\'s record: the card waiting for a tap, or (applied) what revert_train_change takes'),
  applied: z.object({ entity: z.enum(['template', 'equipment', 'exclusion']), id: z.string() }).nullable(),
})

// The tool inputs reuse the Train change fields (shared TrainChange), so the rules live in one place.
const [CreateChange, UpdateChange, DeleteChange, EquipmentChange, HideChange] = TrainChange.options
const { op: _create, ...createFields } = CreateChange.shape
const { op: _update, ...updateFields } = UpdateChange.shape

/** 1–7 weekdays, each once (the same rule as POST /api/ai/week). */
const TrainingDays = PlanWeekRequest.shape.training_days.unwrap()

/** A template as list_templates shows it: compact (results are capped at 12,000 characters), in update_template's shape. */
const { exercise_id, sets, rep_min, rep_max, rest_sec } = TemplateExerciseInput.shape
const TemplateBrief = z.object({
  id: Id,
  name: z.string(),
  notes: z.string().nullable(),
  top_muscles: z.array(Muscle).describe('Up to three, highest muscle score first'),
  exercises: z.array(
    z.object({
      exercise_id,
      name: z.string(),
      sets,
      rep_min,
      rep_max,
      rest_sec,
      target_load_kg: Kg.optional(),
      note: z.string().optional(),
    }),
  ),
})

/** The three muscles a template trains most: muscle score = Σ sets × (1.0 primary, 0.5 secondary), highest first. */
function topMuscles(scores: MuscleScores): Muscle[] {
  return (Object.entries(scores) as [Muscle, number][])
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([muscle]) => muscle)
}

export const TRAINING_TOOLS: readonly ToolDefinition[] = [
  defineTool({
    name: 'list_exercises',
    title: 'List exercises',
    area: 'training',
    description:
      'Search the exercise library: the allowed exercise set only (what the equipment profile and exclusions permit; the only exercises any workout may use). Filter by primary muscle (17 keys: abdominals, abductors, adductors, biceps, calves, chest, forearms, glutes, hamstrings, lats, lower back, middle back, neck, quadriceps, shoulders, traps, triceps), equipment, category, level or name words. Returns compact entries; use get_exercise for instructions and media. Read-only.',
    input: ExerciseQuery.omit({ scope: true }).extend({ limit: z.number().int().min(1).max(200).default(40) }),
    output: z.object({ exercises: z.array(ExerciseBrief), total: Count }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    // The allowed set only (scope is not an input): the AI only ever sees the allowed list (SPEC §7).
    run: async (deps, { limit, ...query }) => {
      const all = await listExercises(deps, { ...query, scope: 'allowed' })
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
    area: 'equipment',
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
    area: 'equipment',
    description:
      'Set the status of equipment or named machines (have, dont_have, dislike, cant_use; names as get_equipment_profile ' +
      'lists them, matched case-insensitively; a new name is added as a machine). Anything not "have" takes its ' +
      'exercises out of the allowed set for every future workout. Only when Aaron tells you what he has, lacks or ' +
      'avoids; notes are edited on the Equipment page. ' +
      `One Train change per item. ${BEHIND_A_TAP} An item a check refused is in \`rejected\` with the reason.`,
    input: z.object({
      items: z
        .array(z.object({ equipment: EquipmentChange.shape.equipment, status: EquipmentChange.shape.status }))
        .min(1)
        .max(20),
      reason: Reason,
    }),
    output: z.object({
      changes: z.array(TrainChangeOutput.extend({ equipment: z.string() })),
      rejected: z.array(z.object({ equipment: z.string(), error: z.string(), message: z.string() })),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: async (deps, { items, reason }) => {
      const changes: Array<z.input<typeof TrainChangeOutput> & { equipment: string }> = []
      const rejected: Array<{ equipment: string; error: string; message: string }> = []
      for (const { equipment, status } of items) {
        try {
          changes.push({ equipment, ...(await trainChange(deps, { change: { op: 'equipment_status', equipment, status }, reason })) })
        } catch (e) {
          // A refused item (422, 404) doesn't undo the others: each is its own change with its own card.
          if (!(e instanceof HttpError) || e.status >= 500) throw e
          rejected.push({ equipment, error: e.code, message: e.message })
        }
      }
      return { changes, rejected }
    },
  }),
  defineTool({
    name: 'hide_exercise',
    title: 'Hide an exercise',
    area: 'equipment',
    description:
      'Hide one exercise from the allowed set (id from list_exercises) when Aaron never wants it again: no workout, ' +
      'template or draft uses it afterwards. Only Aaron can un-hide it (Train → Exercise library). ' +
      BEHIND_A_TAP,
    input: z.object({
      exercise_id: HideChange.shape.exercise_id.describe('The exercise to hide (list_exercises)'),
      reason: HideChange.shape.reason.describe('Why, in a few words (shown in the library as why it is hidden)'),
    }),
    output: TrainChangeOutput,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: (deps, { exercise_id, reason }) => trainChange(deps, { change: { op: 'exercise_hide', exercise_id, reason }, reason }),
  }),
  defineTool({
    name: 'list_templates',
    title: 'List workout templates',
    area: 'templates',
    description:
      'Every saved workout template: id, name, notes, top muscles, and its exercises in order (exercise_id, name, sets, ' +
      'rep range, rest seconds; target_load_kg and note only when set). The ids update_template, delete_template, ' +
      'swap_template_exercise and start_session take. To change sets, reps, rest or order, send update_template the ' +
      'whole new list in this shape (target_load_kg and note null when not listed). Read-only.',
    input: z.object({}),
    output: z.object({ templates: z.array(TemplateBrief) }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    run: async (deps) => {
      const [templates, library] = await Promise.all([listTemplates(deps), loadLibrary(deps)])
      return {
        templates: templates.map((t) => ({
          id: t.id,
          name: t.name,
          notes: t.notes,
          top_muscles: topMuscles(t.muscle_scores),
          exercises: t.exercises.map((e) => ({
            exercise_id: e.exercise_id,
            name: library.byId.get(e.exercise_id)?.name ?? 'Exercise',
            sets: e.sets,
            rep_min: e.rep_min,
            rep_max: e.rep_max,
            rest_sec: e.rest_sec,
            ...(e.target_load_kg === null ? {} : { target_load_kg: e.target_load_kg }),
            ...(e.note ? { note: e.note } : {}),
          })),
        })),
      }
    },
  }),
  defineTool({
    name: 'create_template',
    title: 'Create a workout template',
    area: 'templates',
    description:
      'Save a new reusable workout template: a name (a split day\'s name such as "Upper A" or "Full body" makes it that ' +
      "day's workout), optional notes, and ordered exercises (ids from list_exercises, allowed set only) with sets, rep " +
      'range, target load kg (null = let progression pick), rest seconds and a note. Checked first: allowed exercises ' +
      `only and 12–28 sets in total, else it fails with the rule. ${BEHIND_A_TAP}`,
    input: z.object({ ...createFields, reason: Reason }),
    output: TrainChangeOutput,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: (deps, { reason, ...fields }) => trainChange(deps, { change: { op: 'template_create', ...fields }, reason }),
  }),
  defineTool({
    name: 'update_template',
    title: 'Edit a workout template',
    area: 'templates',
    description:
      'Edit a saved template (id from list_templates or get_training_week): rename it, change its notes (null clears ' +
      'them), or replace its whole exercise list (to change sets, reps, rest or order, send every exercise in the new ' +
      'order; checked against the allowed set and 12–28 sets). Give at least one of name, notes, exercises. ' +
      BEHIND_A_TAP,
    input: z
      .object({
        ...updateFields,
        template_id: updateFields.template_id.describe('The template (list_templates or get_training_week)'),
        reason: Reason,
      })
      .refine((c) => c.name !== undefined || c.notes !== undefined || c.exercises !== undefined, {
        message: 'Change at least one of name, notes or exercises',
      }),
    output: TrainChangeOutput,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: (deps, { reason, ...fields }) => trainChange(deps, { change: { op: 'template_update', ...fields }, reason }),
  }),
  defineTool({
    name: 'delete_template',
    title: 'Delete a workout template',
    area: 'templates',
    description:
      'Delete a saved template (id from list_templates or get_training_week). Past sessions stay, unlinked from it; a ' +
      `split day left without a template gets a fresh draft. ${BEHIND_A_TAP}`,
    input: z.object({
      template_id: DeleteChange.shape.template_id.describe('The template (list_templates or get_training_week)'),
      reason: Reason,
    }),
    output: TrainChangeOutput,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: (deps, { template_id, reason }) => trainChange(deps, { change: { op: 'template_delete', template_id }, reason }),
  }),
  defineTool({
    name: 'swap_template_exercise',
    title: 'Swap an exercise in a template',
    area: 'training',
    description:
      'Replace one exercise of a saved template with another of the same primary muscle and the same kind of lift ' +
      '(e.g. a barbell press for a dumbbell press when the bench is taken), keeping its place, sets, rep range and ' +
      'rest; the target load is cleared so progression picks it. The new exercise must be in the allowed exercise set ' +
      '(list_exercises with the muscle). ' +
      'A safe-list change: from Claude it applies at once once agreed in chat; from the in-app assistant it applies at ' +
      'once only when auto-apply of safe changes is on in Settings, otherwise it waits as a proposal for a tap. ' +
      '`status` says which (applied, proposed or rejected with the rule).',
    input: z.object({
      template_id: Id.describe('The template id (list_templates, a get_week_plan session\'s template_id, or get_review_bundle templates)'),
      from_exercise_id: Id.describe('The exercise in the template to replace'),
      to_exercise_id: Id.describe('The allowed exercise to put in its place (same primary muscle, same kind of lift)'),
    }),
    output: safeChangeOutput(Template),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: (deps, input) => swapTemplateExercise(deps, input),
  }),
  defineTool({
    name: 'revert_train_change',
    title: 'Undo a Train change',
    area: 'templates',
    description:
      'Undo one applied Train change by its proposal_id (create_template, update_template, delete_template, ' +
      'update_equipment, hide_exercise), or a kept split draft that replaced a template: exactly the stored earlier ' +
      'version comes back (a deleted template with its id; a created one is removed), even over a later edit. Works ' +
      'once (409 already_reverted the second time). Training days are changed back with set_training_days.',
    input: z.object({ id: Id.describe('The proposal_id the change returned') }),
    output: Ok,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: (deps, { id }) => revertTrainChange(deps, id),
  }),
  defineTool({
    name: 'get_training_week',
    title: 'Get the training week',
    area: 'week_plans',
    description:
      "The training week as Train shows it: Aaron's training days, the split over them (each day's slot name such as " +
      '"Upper A", "Lower A" or "Full body", its focus upper / lower / full, the template of that name with exercise ' +
      'count, sets and muscle scores, a draft waiting for a tap, and whether one is being drafted), the active week ' +
      "plan's session names when a week plan overrides this week, and the body groups no template covers yet. Read it " +
      'before planning or changing the week. Read-only.',
    input: z.object({}),
    output: TrainingWeek,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    run: (deps) => trainingWeek(deps),
  }),
  defineTool({
    name: 'set_training_days',
    title: 'Set the training days',
    area: 'week_plans',
    description:
      'Change which weekdays are training days (the split follows them: 3 days give Upper A, Lower A and Full body). ' +
      'Daily targets mark the new days as training days from today on; no workout is drafted (plan_training_week does ' +
      'both). From the in-app assistant it waits as a proposal for a tap (status "proposed"); from Claude it applies ' +
      'at once (status "applied"); "unchanged" when the days are already these.',
    input: z.object({ training_days: TrainingDays.describe('Every training day, e.g. ["mon","tue","thu"]') }),
    output: PlanWeekResult.shape.training_days.extend({ training_days: z.array(Weekday) }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, input) => proposeTrainingDays(deps, input),
  }),
  defineTool({
    name: 'plan_training_week',
    title: 'Plan the training week',
    area: 'week_plans',
    description:
      'Plan a whole-body week: with training_days, first sets those days (from the in-app assistant a proposal for a ' +
      'tap, from Claude at once: `training_days.status`), then drafts every day of the split over them in the ' +
      'background, one AI workout draft per day, so that together they cover every body group (2 days in a row: Upper ' +
      'A, Lower A; 3 days: Upper A, Lower A, Full body). Each draft arrives as a card within a minute or two; keeping ' +
      'one saves it as that day\'s template (replacing the template of that name). `only` redrafts just those days ' +
      '(slot names). A day already being drafted is in `skipped`. Fails with no_model_key when no AI model key is set ' +
      '(Settings → AI).',
    input: z.object({
      training_days: PlanWeekRequest.shape.training_days.describe(
        'The training days to plan, e.g. ["mon","tue","thu"]; leave out to keep the current days',
      ),
      only: PlanWeekRequest.shape.only.describe('Slot names to redraft, e.g. ["Full body"]; leave out for every day'),
    }),
    output: PlanWeekResult,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: (deps, input) => planTrainingWeek(deps, input),
  }),
  defineTool({
    name: 'generate_workout',
    title: 'Generate a workout',
    area: 'training',
    description:
      "Ask the app's workout generator for one session for a date: mode 'generate' (optional focus such as \"arms\") or 'fill' (complete a partial exercise list into a balanced session). It uses the allowed set, readiness (sleep, steps, days since the last session), recovery, deload and history, sets loads by progression, and stores the draft as a pending workout proposal Aaron can start from the Train tab. Waits up to 20 s; if still running (or waiting to retry after a failed attempt, with `error` saying why), returns the job id and the draft appears in the app when it is done.",
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
        // An attempt failed and the job waits for its retry (minutes away): say why now instead of waiting it out.
        if (job.status === 'queued' && job.attempts > 0 && job.error)
          return { job_id, status: 'running' as const, draft: null, error: `Waiting to retry: ${job.error}` }
      }
      return { job_id, status: 'running' as const, draft: null, error: null }
    },
  }),
  defineTool({
    name: 'start_session',
    title: 'Start a gym session',
    area: 'training',
    description:
      "Start a session now (or at started_at): from a template (template_id, from list_templates or get_training_week), from a pending AI workout proposal (proposal_id, which accepts it; Claude only — in the app Aaron starts a draft from its card), from today's week-plan session (use_week_plan), from an explicit exercise list, or blank. Only when Aaron asks to start one. Returns the session with its plan: last session's sets per exercise, the progression default load, recovery notes and deload status. Then log_set and finish_session.",
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
      // Starting from a proposal accepts it, and accepting proposals is Aaron's (his tap), never Ask AI's.
      if (i.proposal_id && deps.actor === 'ai')
        throw new HttpError(403, 'needs_approval', 'Starting from a draft accepts it: the user starts it from its card in the app')
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
