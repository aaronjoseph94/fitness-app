// Owns: how an AI event reads on Today (pure) — a proposal as the ProposalCard's title, before → after rows (with units;
// one row per field and amount, its weekdays folded into "Protein · Mon–Thu") and its "why"; any other event (day
// adjustment, review, note, change) as a source line, title, text and details; any event as a row of the recent
// activity table (time, who, what, value).
import { isoWeek } from '@fitness/shared/engine'
import type { AiEvent, Proposal, ProposalStatus } from '@fitness/shared/schemas'
import { formatNumber, formatRecentTime, formatSigned, type ProposalChange } from '../../../components'
import { actorLabel, planChangeRows, planChangeTitle, REMINDER_LABEL } from '../../proposals'

export { actorLabel }

export interface ProposalView {
  title: string
  source: string
  changes: ProposalChange[]
  /** The reasons behind it, shown under "Why". Empty: no Why button. */
  why: string[]
}

export function proposalView(p: Proposal): ProposalView {
  const source = `Proposal · ${actorLabel(p.actor)}`
  const body = p.body
  switch (body.kind) {
    case 'plan_change':
      return { title: planChangeTitle(body.changes), source, changes: planChangeRows(body.changes), why: [...new Set(body.changes.map((c) => c.reason))] }
    case 'workout':
      return {
        // A split day's draft is named ("Upper A draft"); a one-day draft reads by what made it.
        title: body.workout.name ? `${body.workout.name} draft` : body.mode === 'generate' ? 'Suggested workout' : 'Workout filled in',
        source,
        changes: [{ label: body.date ? `Exercises for ${body.date}` : 'Exercises', from: '—', to: String(body.workout.exercises.length) }],
        why: body.workout.rationale ? [body.workout.rationale] : [],
      }
    case 'week_plan':
      return { title: 'Next week’s plan', source, changes: [], why: [] }
    case 'reminder_time':
      return { title: `Move the ${REMINDER_LABEL[body.reminder].toLowerCase()} reminder`, source, changes: [{ label: REMINDER_LABEL[body.reminder], from: '—', to: body.time }], why: [] }
    case 'template_swap':
      return {
        title: `Swap an exercise in ${body.template_name}`,
        source,
        changes: [{ label: 'Exercise', from: body.from_name, to: body.to_name }],
        why: [],
      }
  }
}

export interface EventView {
  source: string
  title: string
  text: string | null
  details: string[]
  /** In-app link, e.g. the weekly review page. */
  link: { to: string; label: string } | null
}

function json(value: unknown): string {
  if (typeof value === 'number') return formatNumber(value, Number.isInteger(value) ? 0 : 1)
  if (value === null || value === undefined) return '—'
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/** Any event as a plain card. `favourite` resolves a favourite id to its label for adjustment suggestions. */
export function eventView(e: AiEvent, favourite: (id: string) => string | null): EventView {
  const who = actorLabel(e.actor)
  switch (e.kind) {
    case 'adjustment': {
      const r = e.body.remaining
      const title =
        e.body.status === 'over' ? 'A little over for today' : e.body.status === 'protein_short' ? 'Protein is short so far' : 'On track today'
      const left = r.kcal >= 0 ? `${formatNumber(r.kcal)} kcal left` : `${formatNumber(-r.kcal)} kcal over`
      const protein = r.protein_g > 0 ? ` · ${formatNumber(r.protein_g)} g protein to go` : ''
      return {
        source: `Day adjustment · ${who}`,
        title,
        text: e.body.note || `${left}${protein}`,
        details: [
          ...(e.body.note ? [`${left}${protein}`] : []),
          ...e.body.suggestions.map((s) => {
            const name = (s.favorite_id ? favourite(s.favorite_id) : null) ?? s.description ?? 'A favourite'
            return `${name}, ${formatNumber(s.grams)} g: ${s.why}`
          }),
        ],
        link: null,
      }
    }
    case 'review':
      return {
        source: `Weekly review · ${who}`,
        title: `Week of ${e.body.week_start}`,
        text: e.summary,
        details: [],
        link: { to: `/reports/week/${isoWeek(e.body.week_start)}`, label: 'Open the review' },
      }
    case 'note':
      return { source: `Note · ${who}`, title: e.summary, text: e.body.text === e.summary ? null : e.body.text, details: [], link: null }
    case 'change':
      return {
        source: `Change · ${who}`,
        title: e.summary,
        text: null,
        details: e.body.changes.map((c) => {
          const delta = typeof c.from === 'number' && typeof c.to === 'number' ? ` (${formatSigned(c.to - c.from, 0)})` : ''
          return `${c.path}: ${json(c.from)} → ${json(c.to)}${delta}`
        }),
        link: null,
      }
    case 'proposal': {
      const v = proposalView(e)
      return { source: v.source, title: v.title, text: e.summary, details: v.changes.map((c) => `${c.label}: ${c.from} → ${c.to}`), link: null }
    }
  }
}

export interface ActivityRow {
  id: string
  /** "2:02 PM" today, else "Tue 4:31 PM". */
  when: string
  /** Who: "AI", "Coach" or "You". */
  who: string
  /** The AI (or the Coach) rather than Aaron. */
  ai: boolean
  text: string
  /** The figure on the right: kcal left, a proposal's status, the number of changes; empty when there is none. */
  value: string
}

const PROPOSAL_STATUS: Record<ProposalStatus, string> = { pending: 'Pending', accepted: 'Accepted', rejected: 'Rejected', auto_applied: 'Applied' }
const ADJUSTMENT_STATUS = { ok: 'On track', over: 'A little over', protein_short: 'Protein short' } as const

/** Any event as a row of Today's recent activity table, timed by its last update (the feed's order). */
export function activityRow(e: AiEvent, now: number = Date.now()): ActivityRow {
  const base = { id: e.id, when: formatRecentTime(e.updated_at, now), who: actorLabel(e.actor), ai: e.actor !== 'user', text: e.summary, value: '' }
  switch (e.kind) {
    case 'adjustment': {
      const r = e.body.remaining
      const protein = r.protein_g > 0 ? `${formatNumber(r.protein_g)} g protein to go` : 'protein met'
      return { ...base, text: `${ADJUSTMENT_STATUS[e.body.status]} · ${protein}`, value: r.kcal >= 0 ? `${formatNumber(r.kcal)} left` : `${formatNumber(-r.kcal)} over` }
    }
    case 'proposal':
      return { ...base, value: PROPOSAL_STATUS[e.proposal_status] }
    case 'change':
      return { ...base, value: `${e.body.changes.length} ${e.body.changes.length === 1 ? 'change' : 'changes'}` }
    default:
      return base
  }
}
