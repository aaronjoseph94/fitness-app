// Owns: how something Ask AI proposed reads on its card (pure) — title, source line, before → after rows with units,
// the reason a plan change or a workout gives, the card status — for a plan change, a workout, a week plan, a reminder
// time or an exercise swap.
import type { ChatProposal } from '@fitness/shared/schemas'
import { formatShortDate, type ProposalChange, type ProposalStatus } from '../../../components'
import { planChangeRow, planChangeTitle, REMINDER_LABEL } from '../../proposals'

export interface ChatProposalView {
  title: string
  summary: string
  changes: ProposalChange[]
  /** A plan change's reason (its changes' distinct reasons, joined) or a workout's rationale, for the card's "Why:" line. */
  why?: string
  status: ProposalStatus
  /** A superseded week plan (rejected, or replaced by a newer one): neither applied now nor waiting. */
  replaced: boolean
}

export function chatProposalView(p: ChatProposal): ChatProposalView {
  if (p.type === 'week_plan') {
    return {
      title: `Plan for the week of ${formatShortDate(p.week_start)}`,
      summary: p.focus_note || 'Targets and sessions for the week.',
      changes: [],
      status: p.status === 'active' ? 'accepted' : 'pending',
      replaced: p.status === 'superseded',
    }
  }
  const body = p.body
  switch (body.kind) {
    case 'plan_change':
      return {
        title: planChangeTitle(body.changes),
        summary: p.summary,
        changes: body.changes.map(planChangeRow),
        why: [...new Set(body.changes.map((c) => c.reason))].join(' '),
        status: p.status,
        replaced: false,
      }
    case 'workout': {
      const sets = body.workout.exercises.reduce((n, e) => n + e.sets, 0)
      return {
        title: body.date ? `Workout for ${formatShortDate(body.date)}` : 'Suggested workout',
        summary: body.workout.rationale || p.summary,
        changes: [{ label: 'Exercises · sets', from: '—', to: `${body.workout.exercises.length} · ${sets}` }],
        why: body.workout.rationale || undefined,
        status: p.status,
        replaced: false,
      }
    }
    case 'week_plan':
      return { title: 'Plan for the week', summary: p.summary, changes: [], status: p.status, replaced: false }
    case 'reminder_time':
      return {
        title: `Move the ${REMINDER_LABEL[body.reminder].toLowerCase()} reminder`,
        summary: p.summary,
        changes: [{ label: REMINDER_LABEL[body.reminder], from: '—', to: body.time }],
        status: p.status,
        replaced: false,
      }
    case 'template_swap':
      return {
        title: `Swap an exercise in ${body.template_name}`,
        summary: p.summary,
        changes: [{ label: 'Exercise', from: body.from_name, to: body.to_name }],
        status: p.status,
        replaced: false,
      }
  }
}
