// Owns: the single 5-minute cron (`*/5 * * * *`). Each tick sweeps ai_jobs, then dispatches work by Edmonton local
// time, each kind at most once per local period through a cron_runs row (unique kind + period_key):
//   nightly  once per local date, after 00:30   ensure targets through today + 14, new safety flags as ai_events
//                                               notes, the "scan due" note, release proposals due today (and on
//                                               days since the last nightly that ran, up to 7), queue today's AI
//                                               workout when it is an unplanned training day, and last reforecast
//                                               as of yesterday
//   weekly   once per ISO week, Sunday ≥ 20:00  the weekly_review job for the week ending that Sunday; a week no
//                                               tick claimed by Sunday midnight is caught up on Monday before 12:00
//   fast     every tick, once per fast          a planned fast that began on its own gets its day_adjustment card
//   backup   every tick from 01:00 until done   the monthly per-table backup to R2, one table per tick (modules/export)
//   remind   every tick 07:00–22:00             due Web Push reminders, once per local period each (modules/reminders)
// A run that throws releases its claim, so the next tick retries it.
import { addDays, eachDate, isoWeek, localTime, safetyFlags, today, weekdayOf } from '@fitness/shared/engine'
import { and, eq, gte, lt, max } from 'drizzle-orm'
import { ai_events, cron_runs } from './db'
import type { Deps } from './lib/deps'
import { days } from './modules/day'
import { eventInsert, releaseDueProposals } from './modules/events'
import './modules/meal-ai' // registers meal_analysis and day_adjustment, which the sweep runs
import { adjustDayForFast, fastsBegunSince } from './modules/fasting'
import { sweep, type SweepResult } from './modules/jobs'
import { monthlyBackupStep } from './modules/export'
import { ensureTargetsThrough, reforecast } from './modules/plan'
import { planNextTrainingDay } from './modules/workouts-ai'
import { weeklyReviewHook } from './modules/reviews'
import { noteScanDue } from './modules/scans'
import { dispatchReminders } from './modules/reminders'

export type CronKind = 'nightly' | 'weekly'

export interface CronResult {
  sweep: SweepResult | null
  /** Kinds that ran (and claimed their period) on this tick. */
  ran: CronKind[]
  failed: CronKind[]
}

const NIGHTLY_AFTER = '00:30'
const WEEKLY_AFTER = '20:00'
/** A weekly review missed on Sunday evening (no tick claimed it) runs on Monday before this time instead. */
const WEEKLY_CATCH_UP_BEFORE = '12:00'
const MONTHLY_AFTER = '01:00'
/** A planned fast that began within this window gets its day_adjustment card (claimed once per fast). */
const FAST_START_WINDOW_MS = 15 * 60_000
/** Days of v_day the safety flags read (rapid loss looks back three weeks plus a day). */
const FLAG_WINDOW_DAYS = 22
/** A flag already noted within this many days is not noted again. */
const FLAG_REPEAT_DAYS = 7
/** Missed days (no nightly ran) whose scheduled proposals the next nightly still releases. */
const RELEASE_CATCH_UP_DAYS = 7

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
  if (weekdayOf(date) === 'sun' && time >= WEEKLY_AFTER) due.push(['weekly', isoWeek(date), () => weekly(deps, isoWeek(date))])
  // Catch-up: the claim is per ISO week, so a Sunday tick that ran makes this a no-op.
  const lastWeek = isoWeek(addDays(date, -1))
  if (weekdayOf(date) === 'mon' && time < WEEKLY_CATCH_UP_BEFORE) due.push(['weekly', lastWeek, () => weekly(deps, lastWeek)])

  for (const [kind, period_key, run] of due) {
    if (!(await claim(deps, kind, period_key))) continue
    try {
      await run()
      result.ran.push(kind)
    } catch (e) {
      result.failed.push(kind)
      log('error', `cron ${kind} failed; released for retry`, { period_key, error: e instanceof Error ? e.message : String(e) })
      await release(deps, kind, period_key)
    }
  }
  await startedFasts(deps).catch((e: unknown) => log('error', 'fast start cards failed; retried next tick', { error: String(e) }))
  if (time >= MONTHLY_AFTER) await monthlyBackupStep(deps, date.slice(0, 7)).catch((e: unknown) => log('error', 'monthly backup step failed; retried next tick', { error: String(e) }))
  await dispatchReminders(deps).catch((e: unknown) => log('error', 'reminders failed; due ones retry next tick', { error: String(e) }))
  return result
}

/** INSERT … ON CONFLICT DO NOTHING RETURNING: true only for the one tick that claims (kind, period_key). */
async function claim(deps: Deps, kind: CronKind | 'fast_start', period_key: string): Promise<boolean> {
  const now = deps.now().toISOString()
  const rows = await deps.db
    .insert(cron_runs)
    .values({ kind, period_key, ran_at: now, created_at: now, updated_at: now })
    .onConflictDoNothing({ target: [cron_runs.kind, cron_runs.period_key] })
    .returning({ id: cron_runs.id })
  return rows.length > 0
}

/** Give a claim back (its run threw), so the next tick retries it. */
async function release(deps: Deps, kind: CronKind | 'fast_start', period_key: string): Promise<void> {
  await deps.db.delete(cron_runs).where(and(eq(cron_runs.kind, kind), eq(cron_runs.period_key, period_key)))
}

/**
 * A nightly that throws is redone in full on the next tick, so every step must be safe to repeat. reforecast is not
 * (on a Sunday as_of it smooths the expenditure estimate against the stored one, so a redo would smooth twice): it runs
 * last, after every step that can fail, and its single write is the nightly's final statement.
 */
async function nightly(deps: Deps, date: string): Promise<void> {
  const as_of = addDays(date, -1) // yesterday is the last complete day
  await ensureTargetsThrough(deps, addDays(date, 14))
  await noteNewFlags(deps, as_of)
  await noteScanDue(deps, date)
  for (const d of await datesSinceLastNightly(deps, date)) await releaseDueProposals(deps, d)
  await planNextTrainingDay(deps, date)
  await reforecast(deps, { as_of })
}

/**
 * Today, and each day after the last nightly that ran (its claim kept), at most RELEASE_CATCH_UP_DAYS back: a day the
 * Worker was down or whose nightly kept failing still gets its scheduled proposals released. Today only on a first run.
 */
async function datesSinceLastNightly(deps: Deps, date: string): Promise<string[]> {
  const [last] = await deps.db
    .select({ key: max(cron_runs.period_key) })
    .from(cron_runs)
    .where(and(eq(cron_runs.kind, 'nightly'), lt(cron_runs.period_key, date)))
  const floor = addDays(date, -(RELEASE_CATCH_UP_DAYS - 1))
  const from = last?.key ? addDays(last.key, 1) : date
  return eachDate(from > floor ? from : floor, date)
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

/** The weekly review job for the week ending this Sunday (skipped when a Claude review ran that week). */
async function weekly(deps: Deps, week: string): Promise<void> {
  await weeklyReviewHook(deps, week)
}

/**
 * SPEC §9 day_adjustment trigger "fast started": a planned fast that began on its own, once per fast (cron_runs). A
 * card that fails to queue gives its claim back, so the next tick inside the start window retries it.
 */
async function startedFasts(deps: Deps): Promise<void> {
  const since = new Date(deps.now().getTime() - FAST_START_WINDOW_MS).toISOString()
  for (const fast of await fastsBegunSince(deps, since)) {
    if (!(await claim(deps, 'fast_start', fast.id))) continue
    try {
      await adjustDayForFast(deps, fast)
    } catch (e) {
      await release(deps, 'fast_start', fast.id)
      throw e
    }
  }
}
