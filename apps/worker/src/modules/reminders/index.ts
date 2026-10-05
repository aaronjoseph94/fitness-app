// Owns: the reminders dispatcher (SPEC §8 "Reminders"), called by the 5-minute cron. On each tick it works out, by
// Edmonton wall-clock time, which reminders are due — weigh-in, water when behind pace, workout on training days,
// fast start/end, scan due, weekly review ready — and sends each through the push module at most once per local period
// (a cron_runs claim, e.g. ('remind:water', '2026-10-05T11:00')). Rules live in lib/rules.ts.
// Interface:
//   dispatchReminders(deps) → ReminderRun   what went out on this tick
//   setReminderTime(deps, { kind, time }) → SafeChangeResult   move a clock reminder (safe list: applied now, or a
//        pending 'reminder_time' proposal); registers that proposal's handler for plan.acceptProposal
// Invariants: nothing between 22:00 and 07:00 (quiet; no reads either); any kind can be off in settings.reminders
// (missing kinds fall back to DEFAULT_REMINDER_PREFS); with no VAPID keys or no subscription for a kind, that kind
// is skipped without touching the database again. A send that reaches no device at all releases its claim, so the
// next tick inside the 30-minute grace window retries; so does a clock reminder whose check throws after its claim.
import { localTime, today } from '@fitness/shared/engine'
import { DEFAULT_REMINDER_PREFS, type PushResult, type ReminderKind, type ReminderPrefs } from '@fitness/shared/schemas'
import { settings } from '../../db'
import { registerProposalHandler } from '../plan'
import { reachableKinds, sendPush, type PushDeps } from '../push'
import { release } from './lib/claims'
import { awake } from './lib/clock'
import { fasts, reviewReady, scanDue, water, weighIn, workout, type Due, type Tick } from './lib/rules'
import { acceptReminderTime } from './lib/time'

export { setReminderTime } from './lib/time'

export interface ReminderSent {
  kind: ReminderKind
  period_key: string
  title: string
  result: PushResult
}

export interface ReminderRun {
  sent: ReminderSent[]
}

const RULES: [ReminderKind, (tick: Tick, now: Date) => Promise<Due[]>][] = [
  ['weigh_in', weighIn],
  ['water', water],
  ['workout', workout],
  ['fast', fasts],
  ['scan_due', scanDue],
  ['review_ready', reviewReady],
]

/** One cron tick of reminders. `deps.now()` decides what is due, so tests pin the clock; deps.pushSender swaps the adapter. */
export async function dispatchReminders(deps: PushDeps): Promise<ReminderRun> {
  const now = deps.now()
  const time = localTime(now)
  if (!awake(time)) return { sent: [] }
  const reachable = await reachableKinds(deps)
  if (reachable.size === 0) return { sent: [] }

  const [row] = await deps.db
    .select({
      reminders: settings.reminders,
      water_target_ml: settings.water_target_ml,
      training_days: settings.training_days,
      fast_hours: settings.fast_hours,
    })
    .from(settings)
    .limit(1)
  if (!row) return { sent: [] }
  const prefs: ReminderPrefs = { ...DEFAULT_REMINDER_PREFS, ...row.reminders }
  const tick: Tick = { deps, date: today(now), time, prefs, settings: row }

  const due: Due[] = []
  for (const [kind, rule] of RULES) {
    if (!reachable.has(kind) || !prefs[kind]?.enabled) continue
    try {
      due.push(...(await rule(tick, now)))
    } catch (e) {
      log('reminder check failed', { kind, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const sent: ReminderSent[] = []
  for (const d of due) {
    const result = await sendPush(deps, d.kind, d.notification, { delivery: d.delivery })
    if (result.sent === 0 && result.failed > 0) await release(deps, d.kind, d.period_key)
    sent.push({ kind: d.kind, period_key: d.period_key, title: d.notification.title, result })
  }
  return { sent }
}

const log = (msg: string, extra: Record<string, unknown>) => console.error(JSON.stringify({ level: 'error', msg, ...extra }))

registerProposalHandler('reminder_time', { accept: acceptReminderTime })
