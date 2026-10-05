// Owns: how an AI event reads on Today (pure) — a proposal as the ProposalCard's title, before → after rows (with units)
// and its "why", and any other event (day adjustment, review, note, change) as a source line, title, text and details.
import { isoWeek, localDate, localTime } from '@fitness/shared/engine'
import type { Actor, AiEvent, ClockReminder, PlanChange, Proposal, TargetField, Weekday } from '@fitness/shared/schemas'
import { formatNumber, formatSigned, type ProposalChange } from '../../../components'

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

/** GLOSSARY: `ai` is the Clerk (free-tier LLM), `mcp` is the Coach (Claude), `user` is Aaron. */
export function actorLabel(actor: Actor): string {
  return actor === 'mcp' ? 'Coach' : actor === 'ai' ? 'AI' : 'You'
}

/** "2026-10-05 14:32" in Edmonton. */
export function whenLabel(instant: string): string {
  return `${localDate(instant)} ${localTime(instant)}`
}

function amount(field: TargetField, value: number): string {
  return `${formatNumber(value)} ${FIELD[field].unit}`
}

function changeRow(c: PlanChange): ProposalChange {
  return {
    label: `${FIELD[c.field].label}${c.weekday ? `, ${WEEKDAY[c.weekday]}` : ''}`,
    from: amount(c.field, c.from),
    to: amount(c.field, c.to),
  }
}

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
    case 'plan_change': {
      const fields = [...new Set(body.changes.map((c) => c.field))]
      const title = fields.length === 1 ? `Adjust ${FIELD[fields[0]!].label.toLowerCase()}` : 'Adjust daily targets'
      return { title, source, changes: body.changes.map(changeRow), why: [...new Set(body.changes.map((c) => c.reason))] }
    }
    case 'workout':
      return {
        title: body.mode === 'generate' ? 'Suggested workout' : 'Workout filled in',
        source,
        changes: [{ label: body.date ? `Exercises for ${body.date}` : 'Exercises', from: '—', to: String(body.workout.exercises.length) }],
        why: body.workout.rationale ? [body.workout.rationale] : [],
      }
    case 'week_plan':
      return { title: 'Next week’s plan', source, changes: [], why: [] }
    case 'reminder_time':
      return { title: `Move the ${REMINDER[body.reminder].toLowerCase()} reminder`, source, changes: [{ label: REMINDER[body.reminder], from: '—', to: body.time }], why: [] }
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
