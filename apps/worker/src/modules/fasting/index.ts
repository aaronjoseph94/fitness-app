// Owns: the fasting module's interface — start (ad hoc, or a planned fast early), end, plan (one of the month's fasts,
// capped at settings.fasts_per_month), move a planned fast before it begins, cancel (a planned fast before it begins,
// a planned fast that began but was never ended — skipped — or a fast ended within an hour of its start — a mis-tap),
// list, and each fast's fast day (engine fastDay: one local date per fast). A fast has begun once started_at <= now (a
// planned fast begins at its time); at most one fast runs at a time, and a fast with no end older than 2 × fast_hours
// no longer counts as running. Rows store start_date / end_date as Edmonton local dates beside the instants. Every
// write rebuilds the affected dates' daily targets (is_fast_day, through the plan module; a past fast day too, so a
// missed or cancelled fast gives its day back) in the same db.batch, then tells the fast listeners (week-plans
// registers one: a week plan's fast_dates mirror the fast log), so fasting never
// imports week-plans. Starting a fast now queues the day_adjustment card (water, light session) in that batch too; a
// planned fast that begins on its own gets it from the cron (fastsBegunSince + adjustDayForFast).
// The monthly cap (settings.fasts_per_month) counts fast days, not start dates: a fast from 31 Oct 19:00 is one of
// November's. planFast holds it for everyone; startFast holds it for Ask AI and Claude (Aaron may start an extra fast
// himself, still one at a time), who also may not backdate a start by more than 24 h.
import { addDays, fastDay, localDate, today } from '@fitness/shared/engine'
import type { Fast, FastEnd, FastListQuery, FastMove, FastPlan, FastStart, Ok } from '@fitness/shared/schemas'
import { and, asc, eq, gt, gte, isNull, lt, lte, ne, or, sql, type SQL } from 'drizzle-orm'
import { fast_logs, settings } from '../../db'
import type { Deps } from '../../lib/deps'
import { badRequest, HttpError, notFound } from '../../lib/http-error'
import { jobInsertOnce, runSoon } from '../jobs'
import { monthOf, toFast } from './lib/rows'
import { fastDayStatements } from './lib/targets'

/** The fast-start card is user-facing. */
const DAY_ADJUSTMENT_PRIORITY = 8

const fastStarted = () => new HttpError(409, 'fast_started', 'This fast has already started; end it instead')
const fastActive = () => new HttpError(409, 'fast_active', 'A fast is already running; end it before starting another')

const HOUR_MS = 3_600_000
/** A fast ended this soon after it started is a mis-tap: it may be deleted like a fast that never happened. */
const MISTAP_MS = HOUR_MS

/** Runs after any fast write lands (planned, moved, started, ended, cancelled). */
export type FastListener = (deps: Deps) => Promise<void>
const listeners: FastListener[] = []

/** Register a fast listener (week-plans does, when it loads). */
export function onFastsChanged(listener: FastListener): void {
  listeners.push(listener)
}

/** Tell the listeners the fast log changed. A failing listener is logged: the fast write stands. */
async function fastsChanged(deps: Deps): Promise<void> {
  for (const listener of listeners) {
    try {
      await listener(deps)
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', msg: 'fast listener failed', error: String(err) }))
    }
  }
}

async function fastRails(deps: Deps): Promise<{ fast_hours: number; fasts_per_month: number }> {
  const [row] = await deps.db.select({ fast_hours: settings.fast_hours, fasts_per_month: settings.fasts_per_month }).from(settings).limit(1)
  return { fast_hours: row?.fast_hours ?? 24, fasts_per_month: row?.fasts_per_month ?? 2 }
}

async function fastHours(deps: Deps): Promise<number> {
  return (await fastRails(deps)).fast_hours
}

/**
 * The monthly cap (SPEC §2: two fasts a month): fasts other than `id` whose fast day (engine fastDay) falls in the
 * month of `date`, plus this one, may not exceed fasts_per_month (422 fasting_pattern). A fast's day is at most a few
 * days after its start date, so starts from the 3 days before the month on are read.
 */
async function assertMonthCap(deps: Deps, input: { id: string; date: string; rails: { fast_hours: number; fasts_per_month: number } }): Promise<void> {
  const month = monthOf(input.date)
  const rows = await deps.db
    .select({ started_at: fast_logs.started_at, ended_at: fast_logs.ended_at })
    .from(fast_logs)
    .where(and(gte(fast_logs.start_date, addDays(month.from, -3)), lt(fast_logs.start_date, month.until), ne(fast_logs.id, input.id)))
  const n = rows.filter((f) => {
    const d = fastDay(f, input.rails.fast_hours)
    return d !== null && d >= month.from && d < month.until
  }).length
  const cap = input.rails.fasts_per_month
  if (n + 1 > cap)
    throw new HttpError(422, 'fasting_pattern', `${input.date.slice(0, 7)} already has ${n} fast day(s); the pattern is ${cap} a month`)
}

/**
 * The fasts whose fast day (engine fastDay with settings.fast_hours) falls in from..to, with that date, oldest first.
 * The only source of fast days: daily_targets and a week plan's fast_dates both follow it.
 */
export async function fastDaysIn(deps: Deps, range: { from: string; to: string }): Promise<{ fast: Fast; date: string }[]> {
  // A fast's day is at most a day after its start date, so it starts on or after from − 1 (listFasts' overlap covers it).
  const [fasts, hours] = await Promise.all([listFasts(deps, range), fastHours(deps)])
  return fasts.flatMap((fast) => {
    const date = fastDay(fast, hours)
    return date !== null && date >= range.from && date <= range.to ? [{ fast, date }] : []
  })
}

/** Clock skew allowed for a start or end "now"; anything later is a future fast, which only planFast may book. */
const SKEW_MS = 5 * 60_000
const latest = (deps: Deps) => new Date(deps.now().getTime() + SKEW_MS).toISOString()

/**
 * Cron: planned fasts that began on their own (by time, no write since: updated_at < started_at) after `since`,
 * today. The cron queues each one's day_adjustment card once (SPEC §9 trigger "fast started"); a fast started by a
 * tap is written at its start and queued its card then.
 */
export async function fastsBegunSince(deps: Deps, since: string): Promise<{ id: string; started_at: string; start_date: string }[]> {
  const now = deps.now()
  return deps.db
    .select({ id: fast_logs.id, started_at: fast_logs.started_at, start_date: fast_logs.start_date })
    .from(fast_logs)
    .where(
      and(
        eq(fast_logs.planned, true),
        isNull(fast_logs.ended_at),
        gt(fast_logs.started_at, since),
        lte(fast_logs.started_at, now.toISOString()),
        eq(fast_logs.start_date, today(now)),
        lt(fast_logs.updated_at, fast_logs.started_at),
      ),
    )
}

/** Queue (and start soon) the day_adjustment card for a fast that began today; false when none was needed. */
export async function adjustDayForFast(deps: Deps, fast: { id: string; started_at: string; start_date: string }): Promise<boolean> {
  const job = await dayAdjustmentJob(deps, fast)
  if (!job) return false
  await job.statement
  runSoon(deps, job.id)
  return true
}

/** The day_adjustment job for a fast that began today, for the caller's batch (null: none needed or one is queued). */
async function dayAdjustmentJob(deps: Deps, fast: { id: string; started_at: string; start_date: string }) {
  if (fast.started_at > deps.now().toISOString() || fast.start_date !== today(deps.now())) return null
  return jobInsertOnce(
    deps,
    {
      type: 'day_adjustment',
      payload: { date: fast.start_date, trigger: 'fast_started', meal_id: null, fast_id: fast.id },
      priority: DAY_ADJUSTMENT_PRIORITY,
    },
    { date: fast.start_date },
  )
}

/** Ask AI and Claude may log a fast that began at most this long ago (Aaron may log an older one himself). */
const AI_BACKDATE_MS = 24 * HOUR_MS

/**
 * POST /api/fasts/start. A new id starts an ad-hoc fast; a planned fast's id starts it now (or at `started_at`).
 * A fast that has already begun is returned as is (replays are no-ops). 409 fast_active while another fast runs;
 * 400 when `started_at` is in the future (beyond 5 min of skew): future fasts go through planFast and its monthly cap.
 * For ai/mcp also: 400 when `started_at` is more than 24 h ago, 422 fasting_pattern over the monthly cap.
 * One running fast is enforced in SQL too: the write's started_at is NULL (NOT NULL fails, so the whole batch rolls
 * back) when another fast began running meanwhile — two starts tapped at once leave one fast.
 */
export async function startFast(deps: Deps, input: FastStart): Promise<Fast> {
  const { db } = deps
  const now = deps.now().toISOString()
  const [row] = await db.select().from(fast_logs).where(eq(fast_logs.id, input.id))
  if (row && row.started_at <= now) return toFast(row)

  // Running = begun, not ended, and within 2 × fast_hours of its start (as the day view counts it): a planned fast
  // nobody ended stops blocking new fasts then (cancel it as skipped, or end it at its real end).
  const rails = await fastRails(deps)
  const runningSince = new Date(deps.now().getTime() - 2 * rails.fast_hours * HOUR_MS).toISOString()
  const otherRunning = and(isNull(fast_logs.ended_at), lte(fast_logs.started_at, now), gt(fast_logs.started_at, runningSince), ne(fast_logs.id, input.id))
  const [running] = await db.select({ id: fast_logs.id }).from(fast_logs).where(otherRunning).limit(1)
  if (running) throw fastActive()

  const started_at = input.started_at ?? now
  // A future start would book a 0 kcal fast day around the monthly cap (SPEC §2: two fasts a month, on dates he picks).
  if (started_at > latest(deps)) throw badRequest('A fast that starts later is planned: use plan_fast / POST /api/fasts/plan')
  if (deps.actor !== 'user') {
    if (Date.parse(started_at) < deps.now().getTime() - AI_BACKDATE_MS)
      throw badRequest('A fast is started now or up to 24 h back; Aaron can log an older one in the app')
    const day = fastDay({ started_at, ended_at: null }, rails.fast_hours)
    if (day) await assertMonthCap(deps, { id: input.id, date: day, rails })
  }
  const start = sql`CASE WHEN EXISTS (SELECT 1 FROM fast_logs AS other WHERE other.ended_at IS NULL AND other.started_at <= ${now} AND other.started_at > ${runningSince} AND other.id <> ${input.id}) THEN NULL ELSE ${started_at} END`
  const fields = { started_at, start_date: localDate(started_at), actor: deps.actor }
  const write = row
    ? db
        .update(fast_logs)
        .set({ ...fields, started_at: start, note: input.note ?? row.note, updated_at: now })
        .where(eq(fast_logs.id, input.id))
    : db.insert(fast_logs).values({ id: input.id, ...fields, started_at: start, planned: false, note: input.note ?? null })
  const pending = { fasts: [{ id: input.id, started_at, ended_at: null }] }
  const targets = await fastDayStatements(deps, pending, rails.fast_hours, { ...fields, ended_at: null, end_date: null }, row)
  const job = await dayAdjustmentJob(deps, { id: input.id, ...fields })
  try {
    await db.batch([write, ...targets, ...(job ? [job.statement] : [])])
  } catch (e) {
    // Lost a race: the same id started by a replay (a no-op), or another fast that is now running (409).
    const [mine] = await db.select().from(fast_logs).where(eq(fast_logs.id, input.id))
    if (mine && mine.started_at <= now) return toFast(mine)
    if ((await db.select({ id: fast_logs.id }).from(fast_logs).where(otherRunning).limit(1)).length) throw fastActive()
    throw e
  }
  if (job) runSoon(deps, job.id)
  await fastsChanged(deps)
  return toFast((await db.select().from(fast_logs).where(eq(fast_logs.id, input.id)))[0]!)
}

/** POST /api/fasts/:id/end. `ended_at` defaults to now (400 if later than now + 5 min); an ended fast returns unchanged. */
export async function endFast(deps: Deps, id: string, input: FastEnd): Promise<Fast> {
  const { db } = deps
  const now = deps.now().toISOString()
  const [row] = await db.select().from(fast_logs).where(eq(fast_logs.id, id))
  if (!row) throw notFound('Fast')
  if (row.ended_at) return toFast(row)
  if (row.started_at > now) throw new HttpError(409, 'fast_not_started', 'This fast has not started yet')
  const ended_at = input.ended_at ?? now
  if (ended_at <= row.started_at) throw badRequest('A fast must end after it started')
  // A future end would turn every day up to it into a fast day.
  if (ended_at > latest(deps)) throw badRequest('A fast ends now or in the past; end it when it ends')

  const end_date = localDate(ended_at)
  const pending = { fasts: [{ id, started_at: row.started_at, ended_at }] }
  const targets = await fastDayStatements(deps, pending, await fastHours(deps), { ...row, ended_at, end_date }, row)
  const [, [saved]] = await db.batch([
    db.update(fast_logs).set({ ended_at, end_date, actor: deps.actor, updated_at: now }).where(eq(fast_logs.id, id)),
    db.select().from(fast_logs).where(eq(fast_logs.id, id)),
    ...targets,
  ])
  await fastsChanged(deps)
  return toFast(saved!)
}

/**
 * POST /api/fasts/plan: put a fast on the calendar at a future start. Re-planning the same id moves it (until it
 * begins; after that the stored fast is returned). Fasts whose fast day falls in this fast's fast-day month, this one
 * included, may not exceed settings.fasts_per_month (422 fasting_pattern).
 */
export async function planFast(deps: Deps, input: FastPlan): Promise<Fast> {
  const { db } = deps
  const now = deps.now().toISOString()
  const [row] = await db.select().from(fast_logs).where(eq(fast_logs.id, input.id))
  if (row && row.started_at <= now) return toFast(row)
  if (input.started_at <= now) throw badRequest('A planned fast must start in the future')

  const rails = await fastRails(deps)
  const start_date = localDate(input.started_at)
  await assertMonthCap(deps, { id: input.id, date: fastDay({ started_at: input.started_at, ended_at: null }, rails.fast_hours) ?? start_date, rails })

  const fields = { started_at: input.started_at, start_date, planned: true, actor: deps.actor }
  const write = row
    ? db
        .update(fast_logs)
        .set({ ...fields, note: input.note ?? row.note, updated_at: now })
        .where(eq(fast_logs.id, input.id))
    : db.insert(fast_logs).values({ id: input.id, ...fields, note: input.note ?? null })
  const pending = { fasts: [{ id: input.id, started_at: input.started_at, ended_at: null }] }
  const targets = await fastDayStatements(deps, pending, rails.fast_hours, { ...fields, ended_at: null, end_date: null }, row)
  const [, [saved]] = await db.batch([write, db.select().from(fast_logs).where(eq(fast_logs.id, input.id)), ...targets])
  await fastsChanged(deps)
  return toFast(saved!)
}

/** PATCH /api/fasts/:id: move a planned fast that has not begun (re-plans it; 409 fast_started once it has). */
export async function moveFast(deps: Deps, id: string, input: FastMove): Promise<Fast> {
  const [row] = await deps.db.select().from(fast_logs).where(eq(fast_logs.id, id))
  if (!row) throw notFound('Fast')
  if (row.started_at <= deps.now().toISOString()) throw fastStarted()
  return planFast(deps, { id, started_at: input.started_at, note: input.note ?? row.note ?? undefined })
}

/**
 * DELETE /api/fasts/:id: remove a fast that did not happen — a planned fast not yet begun, a planned fast that began
 * but was never ended (skipped: "Didn't fast"), or a fast ended within an hour of its start (a mis-tap). It then stops
 * counting toward the month's fasts and is no fast day. 409 fast_started otherwise (end it instead). A replay is a no-op.
 */
export async function cancelFast(deps: Deps, id: string): Promise<Ok> {
  const [row] = await deps.db.select().from(fast_logs).where(eq(fast_logs.id, id))
  if (!row) return { ok: true }
  const begun = row.started_at <= deps.now().toISOString()
  const skipped = row.planned && !row.ended_at
  const mistap = row.ended_at !== null && Date.parse(row.ended_at) - Date.parse(row.started_at) < MISTAP_MS
  if (begun && !skipped && !mistap) throw fastStarted()
  const targets = await fastDayStatements(deps, { removed_fasts: [id] }, await fastHours(deps), row)
  await deps.db.batch([deps.db.delete(fast_logs).where(eq(fast_logs.id, id)), ...targets])
  await fastsChanged(deps)
  return { ok: true }
}

/** GET /api/fasts: fasts overlapping [from, to] (a running or planned fast has no end date), oldest first. */
export async function listFasts(deps: Deps, query: FastListQuery): Promise<Fast[]> {
  const where: SQL[] = []
  if (query.to) where.push(lte(fast_logs.start_date, query.to))
  if (query.from) where.push(or(isNull(fast_logs.end_date), gte(fast_logs.end_date, query.from))!)
  const rows = await deps.db
    .select()
    .from(fast_logs)
    .where(and(...where))
    .orderBy(asc(fast_logs.started_at))
  return rows.map(toFast)
}
