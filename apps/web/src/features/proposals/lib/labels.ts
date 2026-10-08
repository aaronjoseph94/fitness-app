// Owns: how a proposal's pieces read on every card (pure) — target labels and units, weekday and reminder names, who
// proposed it (GLOSSARY: `ai` is the Clerk, `mcp` the Coach, `user` is Aaron), a target change as a before → after
// row, a plan change's rows (one per field and amount, its weekdays folded into "Protein · Mon–Thu"), and its title
// (the summary when it is at most PROPOSAL_TITLE_MAX characters, else "Change the protein target"). Today, the AI tab
// and the plan page all read these, so a new kind or field is one edit.
import { Weekday, type Actor, type ClockReminder, type PlanChange, type TargetField } from '@fitness/shared/schemas'
import { formatNumber, type ProposalChange } from '../../../components'

export const TARGET_FIELD: Record<TargetField, { label: string; unit: string }> = {
  kcal: { label: 'Calories', unit: 'kcal' },
  protein_g: { label: 'Protein', unit: 'g' },
  carbs_g: { label: 'Carbs', unit: 'g' },
  fat_g: { label: 'Fat', unit: 'g' },
  fibre_g: { label: 'Fibre', unit: 'g' },
  water_ml: { label: 'Water', unit: 'ml' },
  steps: { label: 'Steps', unit: 'steps' },
}

/** A weekday override reads as "Calories, Saturdays". */
export const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: 'Mondays',
  tue: 'Tuesdays',
  wed: 'Wednesdays',
  thu: 'Thursdays',
  fri: 'Fridays',
  sat: 'Saturdays',
  sun: 'Sundays',
}

export const REMINDER_LABEL: Record<ClockReminder, string> = { weigh_in: 'Weigh-in', workout: 'Workout', scan_due: 'Scan due' }

export function actorLabel(actor: Actor): string {
  return actor === 'mcp' ? 'Coach' : actor === 'ai' ? 'AI' : 'You'
}

/** "1,600 kcal"; "—" when there is no value (an override that does not exist). */
export function targetAmount(field: TargetField, value: number | null): string {
  return value === null ? '—' : `${formatNumber(value)} ${TARGET_FIELD[field].unit}`
}

/** "Calories" for every day, "Calories, Saturdays" for one weekday's override. */
export function targetLabel(field: TargetField, weekday: Weekday | null): string {
  return `${TARGET_FIELD[field].label}${weekday ? `, ${WEEKDAY_LABEL[weekday]}` : ''}`
}

export function planChangeRow(c: PlanChange): ProposalChange {
  return { label: targetLabel(c.field, c.weekday), from: targetAmount(c.field, c.from), to: targetAmount(c.field, c.to) }
}

/** "Change the calories target" when one field moves, else "Change daily targets". */
export function planChangeTitle(changes: readonly PlanChange[]): string {
  const fields = [...new Set(changes.map((c) => c.field))]
  return fields.length === 1 ? `Change the ${TARGET_FIELD[fields[0]!].label.toLowerCase()} target` : 'Change daily targets'
}

/** A proposal's summary longer than this reads as its plan change's title instead (the summary moves under it). */
export const PROPOSAL_TITLE_MAX = 80

/** The card title: the summary ("Raise protein to 140 g on training days") when it fits, else planChangeTitle. */
export function planChangeHeading(summary: string, changes: readonly PlanChange[]): string {
  return summary.length <= PROPOSAL_TITLE_MAX ? summary : planChangeTitle(changes)
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
export function planChangeRows(changes: readonly PlanChange[]): ProposalChange[] {
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
