// Owns: how a goal change Ask AI proposes reads on every card (pure) — the title ("Summit: 88 kg by Mar 31", the goal
// word from the copy layer), the "now" line from its `before` ("Now 85 kg by Jun 30"), its before → after rows and the
// reason for the card's "Why:" line. Accepting is the Worker's (the same checks as Settings, then a reforecast).
import { today } from '@fitness/shared/engine'
import type { ProposalBody } from '@fitness/shared/schemas'
import { formatNumber, formatShortDate, type ProposalChange } from '../../../components'
import { copy } from '../../../copy'

export type GoalChangeBody = Extract<ProposalBody, { kind: 'goal_change' }>

export interface GoalChangeView {
  title: string
  /** The goals as they were when it was proposed: "Now 85 kg by Jun 30". */
  now: string
  changes: ProposalChange[]
  why?: string
}

/** 88 → "88 kg", 87.5 → "87.5 kg". */
const kg = (v: number | null) => (v === null ? '—' : `${formatNumber(v, Number.isInteger(v) ? 0 : 1)} kg`)
/** "Mar 31"; a date in another year keeps it ("Mar 31, 2027"). */
const day = (d: string | null) => (d === null ? '—' : formatShortDate(d, today(Date.now())))

/** "85 kg by Jun 30", "85 kg", "by Jun 30", or "not set". */
function goalWords(weight: number | null, date: string | null): string {
  const parts = [weight === null ? null : kg(weight), date === null ? null : `by ${day(date)}`].filter(
    Boolean,
  )
  return parts.length ? parts.join(' ') : 'not set'
}

export function goalChangeView(body: GoalChangeBody): GoalChangeView {
  // Null on the proposal = that goal stays as it is.
  const weight = body.goal_weight_kg ?? body.before.goal_weight_kg
  const date = body.goal_date ?? body.before.goal_date
  const changes: ProposalChange[] = []
  if (body.goal_weight_kg !== null)
    changes.push({
      label: `${copy.GoalLabel} weight`,
      from: kg(body.before.goal_weight_kg),
      to: kg(body.goal_weight_kg),
    })
  if (body.goal_date !== null)
    changes.push({
      label: `${copy.GoalLabel} date`,
      from: day(body.before.goal_date),
      to: day(body.goal_date),
    })
  const reason = body.reason?.trim()
  return {
    title: `${copy.GoalLabel}: ${goalWords(weight, date)}`,
    now: `Now ${goalWords(body.before.goal_weight_kg, body.before.goal_date)}`,
    changes,
    ...(reason ? { why: reason } : {}),
  }
}
