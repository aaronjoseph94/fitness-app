// Owns: how an AI event reads on Today (pure) — a proposal as the ProposalCard's title, before → after rows (with units;
// one row per field and amount, its weekdays folded into "Protein · Mon–Thu") and its "why"; any other event (day
// adjustment, review, note, change) as a source line, title, text and details; any event as a row of the recent
// activity table (time, who, what, value); and Today's 12-hour clock ("2:02 PM", Edmonton).
import { isoWeek, localDate, TIMEZONE, today } from '@fitness/shared/engine'
import { Weekday, type AiEvent, type PlanChange, type Proposal, type ProposalStatus } from '@fitness/shared/schemas'
import { formatNumber, formatSigned, type ProposalChange } from '../../../components'
import { actorLabel, planChangeRow, planChangeTitle, REMINDER_LABEL, TARGET_FIELD, targetAmount } from '../../proposals'

export { actorLabel }

const clock = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, hour: 'numeric', minute: '2-digit' })
const weekdayClock = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, weekday: 'short', hour: 'numeric', minute: '2-digit' })

/** "2026-10-07T20:02:00Z" → "2:02 PM" (Edmonton). */
export function clockTime(instant: string): string {
  return clock.format(new Date(instant))
}

/** A stored Edmonton time "16:30" → "4:30 PM". */
export function clockLabel(time: string): string {
  const [h = 0, m = 0] = time.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** An activity row's time: "2:02 PM" when it is from today, else "Tue 4:31 PM". */
export function activityWhen(instant: string, now: number = Date.now()): string {
  return localDate(instant) === today(now) ? clockTime(instant) : weekdayClock.format(new Date(instant)).replace(',', '')
}

/** "mon" → "Mon". */
const shortDay = (d: Weekday) => d.charAt(0).toUpperCase() + d.slice(1)

/** "Mon–Thu" for three or more days in a row, else "Mon, Wed". */
function dayList(days: readonly Weekday[]): string {
  const at = [...new Set(days)].map((d) => Weekday.options.indexOf(d)).sort((a, b) => a - b)
  const first = at[0]!
  const last = at[at.length - 1]!
  if (at.length >= 3 && last - first === at.length - 1) return `${shortDay(Weekday.options[first]!)}–${shortDay(Weekday.options[last]!)}`
  return at.map((i) => shortDay(Weekday.options[i]!)).join(', ')
}

/** One row per field and amount: weekday overrides moving the same way fold into "Protein · Mon–Thu". */
function planChangeRows(changes: readonly PlanChange[]): ProposalChange[] {
  const groups = new Map<string, PlanChange[]>()
  for (const c of changes) {
    const key = `${c.field}|${c.weekday === null ? 'all' : 'day'}|${c.from}|${c.to}`
    groups.set(key, [...(groups.get(key) ?? []), c])
  }
  return [...groups.values()].map((group) => {
    const c = group[0]!
    if (group.length === 1 || c.weekday === null) return planChangeRow(c)
    return {
      label: `${TARGET_FIELD[c.field].label} · ${dayList(group.map((g) => g.weekday!))}`,
      from: targetAmount(c.field, c.from),
      to: targetAmount(c.field, c.to),
    }
  })
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
    case 'plan_change':
      return { title: planChangeTitle(body.changes), source, changes: planChangeRows(body.changes), why: [...new Set(body.changes.map((c) => c.reason))] }
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
  const base = { id: e.id, when: activityWhen(e.updated_at, now), who: actorLabel(e.actor), ai: e.actor !== 'user', text: e.summary, value: '' }
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
