// Owns: what Ask AI may do with each tool (SPEC §8 "Writes are proposals that need a tap", §9 safe list). Reads are
// open (they cannot write); a write is offered only when it is listed here, so a new write tool stays out of Ask AI
// until someone decides its rule (fail closed):
//   log      — Aaron's own logging (he asked for it in the message): applies at once
//   propose  — stores a proposal that waits for his tap (targets, workouts, week plans)
//   safe     — a safe-list kind (meal suggestions, exercise swaps within the same primary muscle, reminder times):
//              applies at once, offered only when settings.auto_apply_safe is on
// Everything else (apply/reject/revert, reviews, equipment, templates, planned fasts, scan dates, the dashboard note,
// the coach procedures) is the coach's or Aaron's, never Ask AI's. Target changes always wait for a tap.
import type { ToolDefinition } from '../../tools'

export type Access = 'read' | 'log' | 'propose' | 'safe'

const WRITES: Readonly<Record<string, Exclude<Access, 'read'>>> = {
  log_weight: 'log',
  log_measurement: 'log',
  log_water: 'log',
  log_meal: 'log',
  confirm_meal: 'log',
  log_sleep: 'log',
  log_steps: 'log',
  start_fast: 'log',
  end_fast: 'log',
  log_set: 'log',
  finish_session: 'log',
  propose_plan_change: 'propose',
  generate_workout: 'propose',
  propose_week_plan: 'propose',
  replace_week_plan: 'propose',
}

/** Read-only tools Ask AI leaves to the coach: the procedures are written around apply tools Ask AI cannot call. */
const COACH_READS = new Set(['get_procedure'])

/** How Ask AI may use `tool`, or null when it may not offer it at all. */
export function accessOf(tool: ToolDefinition, autoApplySafe: boolean): Access | null {
  if (tool.annotations.readOnlyHint) return COACH_READS.has(tool.name) ? null : 'read'
  const access = WRITES[tool.name]
  if (!access) return null
  return access === 'safe' && !autoApplySafe ? null : access
}
