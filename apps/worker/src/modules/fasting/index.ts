// Owns: the fasting module's interface — start (ad hoc, or a planned fast early), end, plan (one of the month's fasts,
// capped at settings.fasts_per_month), move or cancel a planned fast before it begins, and list. A fast has begun once
// started_at <= now (a planned fast begins at its time); at most one fast runs at a time. Rows store start_date /
// end_date as Edmonton local dates beside the instants. Every write rebuilds the affected dates' daily targets
// (is_fast_day) through the plan module. Starting a fast now queues the day_adjustment card (water, light session).
import { localDate, today } from '@fitness/shared/engine'
import type { Fast, FastEnd, FastListQuery, FastMove, FastPlan, FastStart, Ok } from '@fitness/shared/schemas'
import { and, asc, count, eq, gte, isNull, lt, lte, ne, or, type SQL } from 'drizzle-orm'
import { fast_logs, settings } from '../../db'
import type { Deps } from '../../lib/deps'
import { badRequest, HttpError, notFound } from '../../lib/http-error'
import { jobInsertOnce, runSoon } from '../jobs'
import { monthOf, toFast } from './lib/rows'
import { rebuildFastDays } from './lib/targets'

/** The fast-start card is user-facing. */
const DAY_ADJUSTMENT_PRIORITY = 8

const fastStarted = () => new HttpError(409, 'fast_started', 'This fast has already started; end it instead')

/** Queue the day_adjustment card for a fast that began today (one queued job per date covers it). */
async function adjustDayForFast(deps: Deps, fast: { id: string; started_at: string; start_date: string }): Promise<void> {
  if (fast.started_at > deps.now().toISOString() || fast.start_date !== today(deps.now())) return
  const job = await jobInsertOnce(
    deps,
    {
      type: 'day_adjustment',
      payload: { date: fast.start_date, trigger: 'fast_started', meal_id: null, fast_id: fast.id },
      priority: DAY_ADJUSTMENT_PRIORITY,
    },
    { date: fast.start_date },
  )
  if (!job) return
  await job.statement
  runSoon(deps, job.id)
}

/**
 * POST /api/fasts/start. A new id starts an ad-hoc fast; a planned fast's id starts it now (or at `started_at`).
 * A fast that has already begun is returned as is (replays are no-ops). 409 fast_active while another fast runs.
 */
export async function startFast(deps: Deps, input: FastStart): Promise<Fast> {
  const { db } = deps
  const now = deps.now().toISOString()
  const [row] = await db.select().from(fast_logs).where(eq(fast_logs.id, input.id))
  if (row && row.started_at <= now) return toFast(row)

  const [running] = await db
    .select({ id: fast_logs.id })
    .from(fast_logs)
    .where(and(isNull(fast_logs.ended_at), lte(fast_logs.started_at, now), ne(fast_logs.id, input.id)))
    .limit(1)
  if (running) throw new HttpError(409, 'fast_active', 'A fast is already running; end it before starting another')

  const started_at = input.started_at ?? now
  const fields = { started_at, start_date: localDate(started_at), actor: deps.actor }
  const write = row
    ? db
        .update(fast_logs)
        .set({ ...fields, note: input.note ?? row.note, updated_at: now })
        .where(eq(fast_logs.id, input.id))
    : db.insert(fast_logs).values({ id: input.id, ...fields, planned: false, note: input.note ?? null })
  const [, [saved]] = await db.batch([write, db.select().from(fast_logs).where(eq(fast_logs.id, input.id))])
  await rebuildFastDays(deps, saved, row)
  await adjustDayForFast(deps, saved!)
  return toFast(saved!)
}

/** POST /api/fasts/:id/end. `ended_at` defaults to now; ending an ended fast returns it unchanged. */
export async function endFast(deps: Deps, id: string, input: FastEnd): Promise<Fast> {
  const { db } = deps
  const now = deps.now().toISOString()
  const [row] = await db.select().from(fast_logs).where(eq(fast_logs.id, id))
  if (!row) throw notFound('Fast')
  if (row.ended_at) return toFast(row)
  if (row.started_at > now) throw new HttpError(409, 'fast_not_started', 'This fast has not started yet')
  const ended_at = input.ended_at ?? now
  if (ended_at <= row.started_at) throw badRequest('A fast must end after it started')

  const [, [saved]] = await db.batch([
    db
      .update(fast_logs)
      .set({ ended_at, end_date: localDate(ended_at), actor: deps.actor, updated_at: now })
      .where(eq(fast_logs.id, id)),
    db.select().from(fast_logs).where(eq(fast_logs.id, id)),
  ])
  await rebuildFastDays(deps, saved)
  return toFast(saved!)
}

/**
 * POST /api/fasts/plan: put a fast on the calendar at a future start. Re-planning the same id moves it (until it
 * begins; after that the stored fast is returned). Fasts in the start's local month, this one included, may not
 * exceed settings.fasts_per_month (422 fasting_pattern).
 */
export async function planFast(deps: Deps, input: FastPlan): Promise<Fast> {
  const { db } = deps
  const now = deps.now().toISOString()
  const [row] = await db.select().from(fast_logs).where(eq(fast_logs.id, input.id))
  if (row && row.started_at <= now) return toFast(row)
  if (input.started_at <= now) throw badRequest('A planned fast must start in the future')

  const start_date = localDate(input.started_at)
  const month = monthOf(start_date)
  const [[rails], [{ n }]] = await db.batch([
    db.select({ fasts_per_month: settings.fasts_per_month }).from(settings).limit(1),
    db
      .select({ n: count() })
      .from(fast_logs)
      .where(and(gte(fast_logs.start_date, month.from), lt(fast_logs.start_date, month.until), ne(fast_logs.id, input.id))),
  ])
  const cap = rails?.fasts_per_month ?? 2
  if (n! + 1 > cap)
    throw new HttpError(422, 'fasting_pattern', `${start_date.slice(0, 7)} already has ${n} fast(s); the pattern is ${cap} a month`)

  const fields = { started_at: input.started_at, start_date, planned: true, actor: deps.actor }
  const write = row
    ? db
        .update(fast_logs)
        .set({ ...fields, note: input.note ?? row.note, updated_at: now })
        .where(eq(fast_logs.id, input.id))
    : db.insert(fast_logs).values({ id: input.id, ...fields, note: input.note ?? null })
  const [, [saved]] = await db.batch([write, db.select().from(fast_logs).where(eq(fast_logs.id, input.id))])
  await rebuildFastDays(deps, saved, row)
  return toFast(saved!)
}

/** PATCH /api/fasts/:id: move a planned fast that has not begun (re-plans it; 409 fast_started once it has). */
export async function moveFast(deps: Deps, id: string, input: FastMove): Promise<Fast> {
  const [row] = await deps.db.select().from(fast_logs).where(eq(fast_logs.id, id))
  if (!row) throw notFound('Fast')
  if (row.started_at <= deps.now().toISOString()) throw fastStarted()
  return planFast(deps, { id, started_at: input.started_at, note: input.note ?? row.note ?? undefined })
}

/** DELETE /api/fasts/:id: cancel a planned fast that has not begun (409 fast_started once it has). A replay is a no-op. */
export async function cancelFast(deps: Deps, id: string): Promise<Ok> {
  const [row] = await deps.db.select().from(fast_logs).where(eq(fast_logs.id, id))
  if (!row) return { ok: true }
  if (row.started_at <= deps.now().toISOString()) throw fastStarted()
  await deps.db.delete(fast_logs).where(eq(fast_logs.id, id))
  await rebuildFastDays(deps, row)
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
