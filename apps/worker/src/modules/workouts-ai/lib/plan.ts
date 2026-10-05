// Owns: what the AI workout jobs ask for and show the model — the day's focus (from Aaron's note when he gave one, else
// the weekly split: default upper / lower / upper / lower over the training days), the candidate exercises (allowed
// set only, compact), the prompt, and the LLM's reply schema (exercise ids as library slugs, mapped back to UUIDs by
// the repair step).
import { Weekday, type Muscle, type Readiness, type TemplateExerciseInput } from '@fitness/shared/schemas'
import * as z from 'zod'
import type { LibraryEntry, SessionDigest, TrainingDigest } from '../../training'

export type Focus = 'upper' | 'lower' | 'full'

const UPPER: readonly Muscle[] = ['chest', 'shoulders', 'triceps', 'biceps', 'lats', 'middle back', 'traps', 'forearms']
const LOWER: readonly Muscle[] = ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'lower back']
/** Trained on either day. */
const CORE: readonly Muscle[] = ['abdominals']

export const FOCUS_MUSCLES: Record<Focus, readonly Muscle[]> = {
  upper: [...UPPER, ...CORE],
  lower: [...LOWER, ...CORE],
  full: [...UPPER, ...LOWER, ...CORE],
}

/**
 * The day's focus:
 *   fill with a partial list → upper when its primary muscles are all upper (or core), lower when all lower, else full
 *   otherwise → position i of the weekday among the training days (Mon…Sun order): i even → upper, i odd → lower;
 *               not a training day → full
 */
export function dayFocus(weekday: Weekday, training_days: readonly Weekday[], partial_primary: readonly Muscle[]): Focus {
  const own = partial_primary.filter((m) => !CORE.includes(m))
  if (own.length) {
    if (own.every((m) => UPPER.includes(m))) return 'upper'
    if (own.every((m) => LOWER.includes(m))) return 'lower'
    return 'full'
  }
  const order = Weekday.options.filter((d) => training_days.includes(d))
  const i = order.indexOf(weekday)
  return i < 0 ? 'full' : i % 2 === 0 ? 'upper' : 'lower'
}

const LOWER_WORDS = /\b(lower|legs?|glutes?|quads?|quadriceps|hamstrings?|calf|calves)\b/i
const UPPER_WORDS = /\b(upper|push|pull|chest|back|arms?|shoulders?|biceps?|triceps?|lats?)\b/i

/**
 * The focus Aaron asked for in a note (the AI page's chips, Ask AI's "make Thursday a pull day"):
 *   lower words only → lower; upper words only (push, pull, chest, back, arms, …) → upper; anything else → full,
 *   so the candidates cover any muscle and the note itself steers the model.
 */
export function focusFromNote(note: string): Focus {
  const lower = LOWER_WORDS.test(note)
  const upper = UPPER_WORDS.test(note)
  return lower && !upper ? 'lower' : upper && !lower ? 'upper' : 'full'
}

/** Categories a gym session draws from (cardio and Olympic lifts are left to Aaron). */
const SESSION_CATEGORIES: ReadonlySet<string> = new Set(['strength', 'powerlifting'])
const LEVEL_RANK: Record<string, number> = { beginner: 0, intermediate: 1, expert: 2 }

/**
 * Candidates for the prompt, from the allowed set only: category strength/powerlifting, a primary muscle in the
 * focus. Ranked (logged before → in a template → other; compound first; easier level first; name) and capped at
 * `per_muscle` per primary muscle, so the list stays a few thousand tokens.
 */
export function selectCandidates(
  library: readonly LibraryEntry[],
  focus: Focus,
  known: { logged: ReadonlySet<string>; templated: ReadonlySet<string> },
  per_muscle = focus === 'full' ? 10 : 18,
): LibraryEntry[] {
  const muscles = FOCUS_MUSCLES[focus]
  const rank = (e: LibraryEntry) => (known.logged.has(e.id) ? 0 : known.templated.has(e.id) ? 1 : 2)
  const pool = library
    .filter((e) => e.allowed && SESSION_CATEGORIES.has(e.category) && e.primary_muscles.some((m) => muscles.includes(m)))
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.mechanic === 'compound' ? 0 : 1) - (b.mechanic === 'compound' ? 0 : 1) ||
        (LEVEL_RANK[a.level] ?? 3) - (LEVEL_RANK[b.level] ?? 3) ||
        a.name.localeCompare(b.name),
    )
  const counts = new Map<Muscle, number>()
  const out: LibraryEntry[] = []
  for (const e of pool) {
    const own = e.primary_muscles.filter((m) => muscles.includes(m))
    if (!own.some((m) => (counts.get(m) ?? 0) < per_muscle)) continue
    for (const m of own) counts.set(m, (counts.get(m) ?? 0) + 1)
    out.push(e)
  }
  return out
}

/** The LLM's reply. `exercise_id` is a library slug from the list; the repair step maps and guards it. */
export const LlmWorkout = z.object({
  exercises: z
    .array(
      z.object({
        exercise_id: z.string().min(1).max(160),
        sets: z.number().int().min(1).max(10),
        rep_min: z.number().int().min(1).max(50),
        rep_max: z.number().int().min(1).max(50),
        load_kg: z.number().min(0).max(1000).nullable(),
        rest_sec: z.number().int().min(0).max(600),
      }),
    )
    .min(1)
    .max(15),
  rationale: z.string().max(600),
})
export type LlmWorkout = z.infer<typeof LlmWorkout>

export const SYSTEM_PROMPT = [
  'You are a strength coach planning one gym session (machines and free weights only).',
  "The client's goal: fat loss with muscle retention, and upper-body strength. They eat in a calorie deficit.",
  'Rules:',
  '- Use only exercise ids from "Allowed exercises", copied exactly. Never invent an id.',
  '- 4 to 8 exercises: big compound lifts first, then isolation work. Cover the focus muscles evenly.',
  '- Total working sets (sum of sets) inside the range given. Never under 12 or over 28.',
  '- Rep ranges between 5 and 15 with rep_min <= rep_max. Rest 60-180 s, longer for heavy compounds.',
  '- load_kg: stay close to the recent top set shown as last=<kg>x<reps>; null when there is none.',
  '- Do not train an "avoid" muscle as a primary target.',
  '- rationale: two short lines of plain English.',
  'Reply with JSON only.',
].join('\n')

export interface PromptInput {
  mode: 'generate' | 'fill'
  date: string
  weekday: Weekday
  focus: Focus
  note: string | null
  readiness: Readiness
  fast_day: boolean
  avoid: readonly Muscle[]
  sets: { min: number; max: number; aim: string }
  digest: TrainingDigest
  slugOf: (id: string) => string | undefined
  templates: readonly { name: string; muscle_scores: Partial<Record<Muscle, number>> }[]
  equipment_notes: readonly string[]
  partial: readonly TemplateExerciseInput[]
  candidates: readonly LibraryEntry[]
}

const topMuscles = (scores: Partial<Record<Muscle, number>> | null, n = 5) =>
  Object.entries(scores ?? {})
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, n)
    .map(([m, v]) => `${m} ${Math.round((v ?? 0) * 10) / 10}`)
    .join(', ')

function digestLine(s: SessionDigest, slugOf: PromptInput['slugOf']): string {
  const prs = s.prs.filter((p) => p.kind === 'best_e1rm').map((p) => `${slugOf(p.exercise_id) ?? 'exercise'} ${p.load_kg}x${p.reps}`)
  return `${s.date}: ${s.sets_done} sets, ${Math.round(s.volume_kg)} kg; ${topMuscles(s.muscle_scores) || 'muscles n/a'}${prs.length ? `; PRs ${prs.join(', ')}` : ''}`
}

/** The user message: the day, readiness, recovery, recent training, templates, the partial list and the candidates. */
export function buildPrompt(p: PromptInput): string {
  const r = p.readiness
  const readiness = `${r.score}/100 (sleep ${r.sleep_h ?? 'n/a'} h, yesterday's steps ${r.steps_vs_median ?? 'n/a'}x median, ${r.days_since_last_session ?? 'n/a'} days since last session)`
  const lines = [
    `Session date: ${p.date} (${p.weekday}). Focus: ${p.focus === 'full' ? 'full body' : `${p.focus} body`}.`,
    ...(p.note ? [`Client's note: ${p.note.replace(/\s+/g, ' ').slice(0, 200)}`] : []),
    `Readiness: ${readiness}${r.reduced_volume ? ' - reduce volume' : ''}.`,
    `Fast day: ${p.fast_day ? 'yes (24 h fast) - keep it light' : 'no'}.`,
    `Avoid as primary target (trained on a neighbouring day): ${p.avoid.length ? p.avoid.join(', ') : 'none'}.`,
    `Total working sets: aim ${p.sets.aim}, allowed ${p.sets.min}-${p.sets.max}.`,
    '',
    'Last 14 days (date: sets, volume; muscle scores; PRs):',
    ...(p.digest.sessions.length ? p.digest.sessions.map((s) => digestLine(s, p.slugOf)) : ['none logged']),
    '',
    'Saved templates (name: top muscles):',
    ...(p.templates.length ? p.templates.slice(0, 8).map((t) => `${t.name}: ${topMuscles(t.muscle_scores)}`) : ['none']),
    ...(p.equipment_notes.length ? ['', 'Equipment notes:', ...p.equipment_notes] : []),
    ...(p.mode === 'fill'
      ? [
          '',
          'Keep these exercises first, unchanged, and add exercises to complete a balanced session:',
          ...p.partial.map((e) => `${p.slugOf(e.exercise_id) ?? e.exercise_id} ${e.sets}x${e.rep_min}-${e.rep_max}`),
        ]
      : []),
    '',
    'Allowed exercises (id | primary | secondary | equipment | mechanic | last top set):',
    ...p.candidates.map((e) => {
      const last = p.digest.last_top_sets.get(e.id)
      return [e.slug, e.primary_muscles.join(','), e.secondary_muscles.join(',') || '-', e.equipment ?? '-', e.mechanic ?? '-', last ? `last=${last.load_kg}x${last.reps}` : '']
        .join(' | ')
        .replace(/ \| $/, '')
    }),
  ]
  return lines.join('\n')
}
