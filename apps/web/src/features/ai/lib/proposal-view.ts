// Owns: how something Ask AI proposed reads on its card (pure) — title, summary, before → after rows with units,
// the reason a plan change or a workout gives, the card status, and whether it can be undone — for a plan change, a
// workout (a split day's draft by its name, "Upper A draft"), a week plan, a reminder time, an exercise swap, a change
// to Train ("Rename Upper A → Push"), new training days or a goal change ("Summit: 88 kg by Mar 31", now 85 kg by …).
import type { ChatProposal } from '@fitness/shared/schemas'
import { formatShortDate, type ProposalChange, type ProposalStatus } from '../../../components'
import {
  goalChangeView,
  planChangeHeading,
  planChangeRows,
  REMINDER_LABEL,
  trainBodyView,
} from '../../proposals'

export interface ChatProposalView {
  title: string
  summary: string
  changes: ProposalChange[]
  /** A plan change's reason (its changes' distinct reasons, joined) or a workout's rationale, for the card's "Why:" line. */
  why?: string
  status: ProposalStatus
  /** A superseded week plan (rejected, or replaced by a newer one): neither applied now nor waiting. */
  replaced: boolean
  /** Applying it can be undone (POST /api/train-changes/:id/revert): a Train change, or a workout that replaced a template. */
  revertible: boolean
  /** Already undone: the body says when. */
  undone: boolean
}

const NOT_REVERTIBLE = { revertible: false, undone: false } as const

export function chatProposalView(p: ChatProposal): ChatProposalView {
  if (p.type === 'week_plan') {
    return {
      title: `Plan for the week of ${formatShortDate(p.week_start)}`,
      summary: p.focus_note || 'Targets and sessions for the week.',
      changes: [],
      status: p.status === 'active' ? 'accepted' : 'pending',
      replaced: p.status === 'superseded',
      ...NOT_REVERTIBLE,
    }
  }
  const body = p.body
  switch (body.kind) {
    case 'plan_change':
      return {
        title: planChangeHeading(p.summary, body.changes),
        summary: p.summary,
        changes: planChangeRows(body.changes),
        why: [...new Set(body.changes.map((c) => c.reason))].join(' '),
        status: p.status,
        replaced: false,
        ...NOT_REVERTIBLE,
      }
    case 'workout': {
      const sets = body.workout.exercises.reduce((n, e) => n + e.sets, 0)
      return {
        // A split day's draft is named ("Upper A draft"); a one-day draft reads by its date.
        title: body.workout.name
          ? `${body.workout.name} draft`
          : body.date
            ? `Workout for ${formatShortDate(body.date)}`
            : 'Suggested workout',
        summary: body.workout.rationale || p.summary,
        changes: [{ label: 'Exercises · sets', from: '—', to: `${body.workout.exercises.length} · ${sets}` }],
        why: body.workout.rationale || undefined,
        status: p.status,
        replaced: false,
        // Accepting a split draft that replaced a template keeps the template as it was, so the draft can be undone.
        revertible: body.replaced !== undefined,
        undone: body.reverted_at !== undefined,
      }
    }
    case 'week_plan':
      return {
        title: 'Plan for the week',
        summary: p.summary,
        changes: [],
        status: p.status,
        replaced: false,
        ...NOT_REVERTIBLE,
      }
    case 'reminder_time':
      return {
        title: `Move the ${REMINDER_LABEL[body.reminder].toLowerCase()} reminder`,
        summary: p.summary,
        changes: [{ label: REMINDER_LABEL[body.reminder], from: '—', to: body.time }],
        status: p.status,
        replaced: false,
        ...NOT_REVERTIBLE,
      }
    case 'template_swap':
      return {
        title: `Swap an exercise in ${body.template_name}`,
        summary: p.summary,
        changes: [{ label: 'Exercise', from: body.from_name, to: body.to_name }],
        status: p.status,
        replaced: false,
        ...NOT_REVERTIBLE,
      }
    case 'train_change':
    case 'training_days': {
      const view = trainBodyView(body, p.summary)
      return {
        title: view.title,
        summary: p.summary,
        changes: view.changes,
        why: view.why,
        status: p.status,
        replaced: false,
        // The revert route takes a Train change; moved training days have none (change them again on Train).
        revertible: body.kind === 'train_change',
        undone: body.kind === 'train_change' && body.reverted_at !== undefined,
      }
    }
    case 'goal_change': {
      const view = goalChangeView(body)
      return {
        title: view.title,
        summary: view.now,
        changes: view.changes,
        why: view.why,
        status: p.status,
        replaced: false,
        ...NOT_REVERTIBLE,
      }
    }
  }
}
