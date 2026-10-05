// Owns: how a proposal's pieces read on every card (pure) — target labels and units, weekday and reminder names, who
// proposed it (GLOSSARY: `ai` is the Clerk, `mcp` the Coach, `user` is Aaron), a target change as a before → after
// row, and a plan change's title. Today, the AI tab and the plan page all read these, so a new kind or field is one edit.
import type { Actor, ClockReminder, PlanChange, TargetField, Weekday } from '@fitness/shared/schemas'
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
