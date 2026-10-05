// Owns: the day — everything Today and get_today show for one local date (DayView), the per-day series the Progress
// charts and the weekly review read (DaySummary[] from v_day with the trend merged).
// Interface:
//   getDay(deps, date)          → DayView        targets, intake by slot, remaining, water, steps, last night's sleep,
//                                                 fast state, raw/trend weight, forecast, session, planned session,
//                                                 pending proposals (count + latest), dashboard note
//   days(deps, { from, to })    → DaySummary[]   one row per spine date (dates with daily_targets)
// The dashboard note comes from the notes module. Both reads first guarantee the v_day spine (start_date … today + 14)
// through the plan module.
import { addDays, today } from '@fitness/shared/engine'
import type { DaySummary, DayView } from '@fitness/shared/schemas'
import type { Deps } from '../../lib/deps'
import { pendingProposals } from '../events'
import { activeNote } from '../notes'
import { ensureTargetsThrough } from '../plan'
import { buildDays } from './lib/summary'
import { buildDay } from './lib/view'

/** The spine runs this many days past today, so the week ahead always has targets. */
const SPINE_AHEAD_DAYS = 14

const spineEnd = (deps: Deps) => addDays(today(deps.now()), SPINE_AHEAD_DAYS)

export async function getDay(deps: Deps, date: string): Promise<DayView> {
  await ensureTargetsThrough(deps, spineEnd(deps))
  const [core, proposals, note] = await Promise.all([buildDay(deps, date), pendingProposals(deps, date), activeNote(deps)])
  return { ...core, proposals, note }
}

export async function days(deps: Deps, range: { from: string; to: string }): Promise<DaySummary[]> {
  const end = spineEnd(deps)
  await ensureTargetsThrough(deps, range.to < end ? range.to : end)
  return buildDays(deps, range)
}
