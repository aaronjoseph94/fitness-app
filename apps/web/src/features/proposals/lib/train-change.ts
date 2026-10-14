// Owns: how a change to Train reads on every card (pure) — the title and before → after rows of an AI template
// created, edited or deleted, an equipment status moved, an exercise hidden, and of training days moved. The AI tab and
// Today both read this, so a new op is one edit. A pending change has no `before` yet (the Worker writes it when the
// change is applied), so a name it would come from falls back to neutral copy and the proposal's own summary says the rest.
import { Weekday, type EquipmentStatus, type ProposalBody } from '@fitness/shared/schemas'
import type { ProposalChange } from '../../../components'
import { shortDay } from './labels'

/** The two proposal bodies that change Train (or the days it trains on). */
export type TrainBody = Extract<ProposalBody, { kind: 'train_change' | 'training_days' }>

export interface TrainBodyView {
  title: string
  changes: ProposalChange[]
  /** The reason the AI gave (an exercise hidden), for the card's "Why:" line. */
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
const sizeWords = (exercises: readonly { sets: number }[]) => `${count(exercises.length, 'exercise')}, ${count(setsOf(exercises), 'set')}`
/** "leg press" → "Leg press". */
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** The days in week order, unfolded: "Mon, Tue, Thu"; "none" for no days. */
export function dayNames(days: readonly Weekday[]): string {
  const names = Weekday.options.filter((d) => days.includes(d)).map(shortDay)
  return names.length ? names.join(', ') : 'none'
}

export function trainBodyView(body: TrainBody): TrainBodyView {
  if (body.kind === 'training_days') {
    return { title: `Training days: ${dayNames(body.before)} → ${dayNames(body.training_days)}`, changes: [] }
  }
  const { change: c, before } = body
  // The template as it was (update, delete) or the equipment status as it was (equipment_status); null while pending.
  const snapshot = before && 'exercises' in before ? before : null
  const was = before && 'status' in before ? before.status : null
  switch (c.op) {
    case 'template_create':
      return { title: `New template: ${c.name}`, changes: [{ label: 'Exercises · sets', from: '—', to: size(c.exercises) }] }
    case 'template_update': {
      const old = snapshot?.name
      const changes: ProposalChange[] = []
      if (c.exercises) changes.push({ label: 'Exercises · sets', from: snapshot ? size(snapshot.exercises) : '—', to: size(c.exercises) })
      if (c.notes !== undefined) {
        changes.push({ label: 'Notes', from: snapshot ? (snapshot.notes ? 'Had notes' : 'No notes') : '—', to: c.notes ? 'Updated' : 'No notes' })
      }
      if (c.name !== undefined && c.name !== old) return { title: `Rename ${old ?? 'a template'} → ${c.name}`, changes }
      if (c.exercises) return { title: `${old ?? 'A template'}: ${sizeWords(c.exercises)}`, changes }
      return { title: old ? `Change notes on ${old}` : 'Change a template’s notes', changes }
    }
    case 'template_delete':
      return {
        title: snapshot ? `Delete template ${snapshot.name}` : 'Delete a template',
        changes: snapshot ? [{ label: 'Exercises · sets', from: size(snapshot.exercises), to: 'Deleted' }] : [],
      }
    case 'equipment_status':
      return {
        title: `${sentence(c.equipment)} → ${STATUS_WORD[c.status]}`,
        changes: was ? [{ label: 'Status', from: STATUS_WORD[was], to: STATUS_WORD[c.status] }] : [],
      }
    // The change carries the exercise's id, not its name: the title stays neutral and the summary names it.
    case 'exercise_hide':
      return { title: 'Hide an exercise', changes: [], why: c.reason }
  }
}
