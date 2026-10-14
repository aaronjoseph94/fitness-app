// Owns: how a change to Train reads on every card (pure) — the title and before → after rows of an AI template
// created, edited or deleted, an equipment status moved, an exercise hidden, and of training days moved, plus the AI's
// reason for the card's "Why:" line. The AI tab and Today both read this, so a new op is one edit. The Worker stores
// `before` when it proposes a change (pending or applied), so rows show real "from" values. A Train change is titled by
// the proposal's own summary when it fits PROPOSAL_TITLE_MAX ("Rename Upper A → Push", "Hide Kettlebell Swing": the
// Worker names what the change holds only ids for); otherwise by the title built here, where an exercise hidden stays
// neutral because the change has its id.
import { Weekday, type EquipmentStatus, type ProposalBody } from '@fitness/shared/schemas'
import type { ProposalChange } from '../../../components'
import { PROPOSAL_TITLE_MAX, shortDay } from './labels'

/** The two proposal bodies that change Train (or the days it trains on). */
export type TrainBody = Extract<ProposalBody, { kind: 'train_change' | 'training_days' }>

export interface TrainBodyView {
  title: string
  changes: ProposalChange[]
  /** The reason the AI gave (the body's `reason`, else an exercise hidden's own), for the card's "Why:" line. */
  why?: string
}

/** The words of the equipment screen's status control (the library feature keeps its own copy of the map). */
const STATUS_WORD: Readonly<Record<EquipmentStatus, string>> = {
  have: 'Have',
  dont_have: "Don't have",
  dislike: 'Dislike',
  cant_use: "Can't use",
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`
const setsOf = (exercises: readonly { sets: number }[]) => exercises.reduce((n, e) => n + e.sets, 0)
/** "6 · 20": exercises · sets, the format the workout card uses. */
const size = (exercises: readonly { sets: number }[]) => `${exercises.length} · ${setsOf(exercises)}`
/** "6 exercises, 20 sets". */
const sizeWords = (exercises: readonly { sets: number }[]) =>
  `${count(exercises.length, 'exercise')}, ${count(setsOf(exercises), 'set')}`
/** "leg press" → "Leg press". */
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** The days in week order, unfolded: "Mon, Tue, Thu"; "none" for no days. */
function dayNames(days: readonly Weekday[]): string {
  const names = Weekday.options.filter((d) => days.includes(d)).map(shortDay)
  return names.length ? names.join(', ') : 'none'
}

/**
 * A Train change takes the proposal's summary as its title when it is one short line (as a plan change does). Its
 * "Why:" is the reason the AI gave with the change (`body.reason`), else what an exercise hidden carries itself.
 */
export function trainBodyView(body: TrainBody, summary: string): TrainBodyView {
  const view = bodyView(body)
  const why = body.reason?.trim() || view.why
  const titled =
    body.kind === 'train_change' && summary.trim() !== '' && summary.length <= PROPOSAL_TITLE_MAX
      ? { ...view, title: summary }
      : view
  return why ? { ...titled, why } : titled
}

function bodyView(body: TrainBody): TrainBodyView {
  if (body.kind === 'training_days') {
    return { title: `Training days: ${dayNames(body.before)} → ${dayNames(body.training_days)}`, changes: [] }
  }
  const { change: c, before } = body
  // The template as it was (update, delete) or the equipment status as it was (equipment_status).
  const snapshot = before && 'exercises' in before ? before : null
  const was = before && 'status' in before ? before.status : null
  switch (c.op) {
    case 'template_create':
      return {
        title: `New template: ${c.name}`,
        changes: [{ label: 'Exercises · sets', from: '—', to: size(c.exercises) }],
      }
    case 'template_update': {
      const name = snapshot?.name ?? 'a template'
      const changes: ProposalChange[] = []
      if (c.exercises)
        changes.push({
          label: 'Exercises · sets',
          from: snapshot ? size(snapshot.exercises) : '—',
          to: size(c.exercises),
        })
      if (c.notes !== undefined) {
        changes.push({
          label: 'Notes',
          from: snapshot ? (snapshot.notes ? 'Had notes' : 'No notes') : '—',
          to: c.notes ? 'Updated' : 'No notes',
        })
      }
      if (c.name !== undefined && c.name !== snapshot?.name)
        return { title: `Rename ${name} → ${c.name}`, changes }
      if (c.exercises) return { title: `Edit ${name}: ${sizeWords(c.exercises)}`, changes }
      return { title: `Change notes on ${name}`, changes }
    }
    case 'template_delete':
      return {
        title: `Delete template${snapshot ? ` ${snapshot.name}` : ''}`,
        changes: snapshot
          ? [{ label: 'Exercises · sets', from: size(snapshot.exercises), to: 'Deleted' }]
          : [],
      }
    case 'equipment_status':
      return {
        title: `${sentence(c.equipment)} → ${STATUS_WORD[c.status]}`,
        changes: was ? [{ label: 'Status', from: STATUS_WORD[was], to: STATUS_WORD[c.status] }] : [],
      }
    // The change carries the exercise's id, not its name: this title is neutral, and the summary (which names it) replaces it.
    case 'exercise_hide':
      return { title: 'Hide an exercise', changes: [], why: c.reason }
  }
}
