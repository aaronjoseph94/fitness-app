// Owns: the single 5-minute cron (`*/5 * * * *`). Each tick sweeps ai_jobs, then dispatches work by Edmonton local
// time, each kind at most once per local period through a cron_runs row (unique kind + period_key):
//   nightly  once per local date, after 00:30   ensure targets through today + 14, reforecast as of yesterday,
//                                               new safety flags as ai_events notes, release proposals due today
//   weekly   once per ISO week, Sunday ≥ 20:00  the weekly review (hook only until phase 4 builds it)
//   monthly  once per local month, ≥ 01:00      the monthly backup (hook only until phase 5 builds it)
// A run that throws releases its claim, so the next tick retries it.
import { addDays, isoWeek, localTime, safetyFlags, today, weekdayOf } from '@fitness/shared/engine'
import { and, eq, gte } from 'drizzle-orm'
import { ai_events, cron_runs } from './db'
import type { Deps } from './lib/deps'
import { days } from './modules/day'
import { eventInsert, releaseDueProposals } from './modules/events'
import { sweep, type SweepResult } from './modules/jobs'
import { ensureTargetsThrough, reforecast } from './modules/plan'

export type CronKind = 'nightly' | 'weekly' | 'monthly'

export interface CronResult {
  sweep: SweepResult | null
  /** Kinds that ran (and claimed their period) on this tick. */
  ran: CronKind[]
  failed: CronKind[]
}

const NIGHTLY_AFTER = '00:30'
const WEEKLY_AFTER = '20:00'
const MONTHLY_AFTER = '01:00'
/** Days of v_day the safety flags read (rapid loss looks back three weeks plus a day). */
const FLAG_WINDOW_DAYS = 22
/** A flag already noted within this many days is not noted again. */
const FLAG_REPEAT_DAYS = 7

const log = (level: 'info' | 'error', msg: string, extra: Record<string, unknown> = {}) =>
  console[level === 'error' ? 'error' : 'log'](JSON.stringify({ level, msg, ...extra }))

/** One cron tick. `deps.now()` decides what is due, so tests pin the clock. */
export async function runCron(deps: Deps): Promise<CronResult> {
  const result: CronResult = { sweep: null, ran: [], failed: [] }
  try {
    result.sweep = await sweep(deps)
  } catch (e) {
    log('error', 'job sweep failed', { error: String(e) })
  }

  const now = deps.now()
  const date = today(now)
  const time = localTime(now)
  const due: [CronKind, string, () => Promise<void>][] = []
  if (time >= NIGHTLY_AFTER) due.push(['nightly', date, () => nightly(deps, date)])
  if (weekdayOf(date) === 'sun' && time >= WEEKLY_AFTER) due.push(['weekly', isoWeek(date), () => weekly(isoWeek(date))])
  if (time >= MONTHLY_AFTER) due.push(['monthly', date.slice(0, 7), () => monthly(date.slice(0, 7))])

  for (const [kind, period_key, run] of due) {
    if (!(await claim(deps, kind, period_key))) continue
    try {
      await run()
      result.ran.push(kind)
    } catch (e) {
      result.failed.push(kind)
      log('error', `cron ${kind} failed; released for retry`, { period_key, error: e instanceof Error ? e.message : String(e) })
      await deps.db.delete(cron_runs).where(and(eq(cron_runs.kind, kind), eq(cron_runs.period_key, period_key)))
    }
  }
  return result
}

/** INSERT … ON CONFLICT DO NOTHING RETURNING: true only for the one tick that claims (kind, period_key). */
async function claim(deps: Deps, kind: CronKind, period_key: string): Promise<boolean> {
  const now = deps.now().toISOString()
  const rows = await deps.db
    .insert(cron_runs)
    .values({ kind, period_key, ran_at: now, created_at: now, updated_at: now })
    .onConflictDoNothing({ target: [cron_runs.kind, cron_runs.period_key] })
    .returning({ id: cron_runs.id })
  return rows.length > 0
}

async function nightly(deps: Deps, date: string): Promise<void> {
  const as_of = addDays(date, -1) // yesterday is the last complete day
  await ensureTargetsThrough(deps, addDays(date, 14))
  await reforecast(deps, { as_of })
  await noteNewFlags(deps, as_of)
  await releaseDueProposals(deps, date)
}

/** Safety flags (SPEC §3) as ai_events notes, shown never applied; a kind noted in the last 7 days is skipped. */
async function noteNewFlags(deps: Deps, as_of: string): Promise<void> {
  const series = await days(deps, { from: addDays(as_of, -FLAG_WINDOW_DAYS), to: as_of })
  const flags = safetyFlags({ as_of, days: series })
  if (flags.length === 0) return
  const since = new Date(deps.now().getTime() - FLAG_REPEAT_DAYS * 86_400_000).toISOString()
  const recent = await deps.db
    .select({ body: ai_events.body })
    .from(ai_events)
    .where(and(eq(ai_events.kind, 'note'), gte(ai_events.created_at, since)))
  const noted = new Set(recent.map((r) => (r.body as { flag?: string } | null)?.flag))
  const fresh = flags.filter((f) => !noted.has(f.kind))
  const [first, ...rest] = fresh.map(
    (f) => eventInsert(deps, { kind: 'note', summary: f.message, body: { text: f.message, flag: f.kind, detail: f }, date: as_of }).statement,
  )
  if (first) await deps.db.batch([first, ...rest])
}

/** Hook for the weekly review job (phase 4: weekly_review unless a Claude review ran this week). */
async function weekly(week: string): Promise<void> {
  log('info', 'weekly review not built yet; skipped', { week })
}

/** Hook for the monthly per-table JSON backup to R2 (phase 5). */
async function monthly(month: string): Promise<void> {
  log('info', 'monthly backup not built yet; skipped', { month })
}
