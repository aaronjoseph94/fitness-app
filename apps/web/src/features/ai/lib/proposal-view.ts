// Owns: how something Ask AI proposed reads on its card (pure) — title, source line, before → after rows with units,
// the card status — for a plan change, a workout, a week plan, a reminder time or an exercise swap.
import type { ChatProposal, ClockReminder, PlanChange, TargetField, Weekday } from '@fitness/shared/schemas'
import { formatNumber, formatShortDate, type ProposalChange, type ProposalStatus } from '../../../components'

const FIELD: Record<TargetField, { label: string; unit: string }> = {
  kcal: { label: 'Calories', unit: 'kcal' },
  protein_g: { label: 'Protein', unit: 'g' },
  carbs_g: { label: 'Carbs', unit: 'g' },
  fat_g: { label: 'Fat', unit: 'g' },
  fibre_g: { label: 'Fibre', unit: 'g' },
  water_ml: { label: 'Water', unit: 'ml' },
  steps: { label: 'Steps', unit: 'steps' },
}

const REMINDER: Record<ClockReminder, string> = { weigh_in: 'Weigh-in', workout: 'Workout', scan_due: 'Scan due' }

const WEEKDAY: Record<Weekday, string> = {
  mon: 'Mondays',
  tue: 'Tuesdays',
  wed: 'Wednesdays',
  thu: 'Thursdays',
  fri: 'Fridays',
  sat: 'Saturdays',
  sun: 'Sundays',
}

function changeRow(c: PlanChange): ProposalChange {
  const { label, unit } = FIELD[c.field]
  return {
    label: `${label}${c.weekday ? `, ${WEEKDAY[c.weekday]}` : ''}`,
    from: `${formatNumber(c.from)} ${unit}`,
    to: `${formatNumber(c.to)} ${unit}`,
  }
}

export interface ChatProposalView {
  title: string
  summary: string
  changes: ProposalChange[]
  status: ProposalStatus
  /** A superseded week plan: neither applied now nor waiting. */
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
    case 'plan_change': {
      const fields = [...new Set(body.changes.map((c) => c.field))]
      const title = fields.length === 1 ? `Change the ${FIELD[fields[0]!].label.toLowerCase()} target` : 'Change daily targets'
      return { title, summary: p.summary, changes: body.changes.map(changeRow), status: p.status, replaced: false }
    }
    case 'workout': {
      const sets = body.workout.exercises.reduce((n, e) => n + e.sets, 0)
      return {
        title: body.date ? `Workout for ${formatShortDate(body.date)}` : 'Suggested workout',
        summary: body.workout.rationale || p.summary,
        changes: [{ label: 'Exercises · sets', from: '—', to: `${body.workout.exercises.length} · ${sets}` }],
        status: p.status,
        replaced: false,
      }
    }
    case 'week_plan':
      return { title: 'Plan for the week', summary: p.summary, changes: [], status: p.status, replaced: false }
    case 'reminder_time':
      return {
        title: `Move the ${REMINDER[body.reminder].toLowerCase()} reminder`,
        summary: p.summary,
        changes: [{ label: REMINDER[body.reminder], from: '—', to: body.time }],
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
