// Owns: the body module's interface — weigh-ins (one per local date; logging a date that has one replaces it), tape
// measurements (one per date and site; replaced likewise) and the trend series for a range. Creates are idempotent by
// the client id: a replay returns the stored row untouched. A date after today (Edmonton) is refused: a weigh-in or tape
// for a day that has not happened would move the trend, the forecast and milestones.
import type {
  DateRange,
  Measurement,
  MeasurementsCreate,
  TrendSeries,
  WeighIn,
  WeighInCreate,
  WeighInUpdate,
} from '@fitness/shared/schemas'
import { today } from '@fitness/shared/engine'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { measurements, weight_logs } from '../../db'
import type { Deps } from '../../lib/deps'
import { badRequest, notFound } from '../../lib/http-error'
import { toMeasurement, toWeighIn } from './lib/rows'
import { buildTrend } from './lib/trend'

/** A phone clock a few minutes ahead of the Worker's at midnight still logs "today". */
const CLOCK_SKEW_MS = 5 * 60_000

/** 400 when `date` is after today in Edmonton. */
function assertPast(deps: Deps, date: string): void {
  if (date > today(new Date(deps.now().getTime() + CLOCK_SKEW_MS))) throw badRequest(`${date} has not happened yet; log today or an earlier day`)
}

/** POST /api/weights: store the weigh-in for its date, replacing any other weigh-in on that date. */
export async function logWeighIn(deps: Deps, input: WeighInCreate): Promise<WeighIn> {
  const { db } = deps
  const [existing] = await db.select().from(weight_logs).where(eq(weight_logs.id, input.id))
  if (existing) return toWeighIn(existing)
  assertPast(deps, input.date)
  const [, , [row]] = await db.batch([
    db.delete(weight_logs).where(eq(weight_logs.date, input.date)),
    db.insert(weight_logs).values({
      id: input.id,
      date: input.date,
      weight_kg: input.weight_kg,
      note: input.note ?? null,
      actor: deps.actor,
    }),
    db.select().from(weight_logs).where(eq(weight_logs.id, input.id)),
  ])
  return toWeighIn(row!)
}

/** PUT /api/weights/:id: new values for a weigh-in. Moving it to a date that has another weigh-in replaces that one. */
export async function updateWeighIn(deps: Deps, id: string, input: WeighInUpdate): Promise<WeighIn> {
  const { db } = deps
  const [existing] = await db.select({ id: weight_logs.id }).from(weight_logs).where(eq(weight_logs.id, id))
  if (!existing) throw notFound('Weigh-in')
  assertPast(deps, input.date)
  const [, , [row]] = await db.batch([
    db.delete(weight_logs).where(and(eq(weight_logs.date, input.date), ne(weight_logs.id, id))),
    db
      .update(weight_logs)
      .set({ date: input.date, weight_kg: input.weight_kg, note: input.note, actor: deps.actor, updated_at: deps.now().toISOString() })
      .where(eq(weight_logs.id, id)),
    db.select().from(weight_logs).where(eq(weight_logs.id, id)),
  ])
  return toWeighIn(row!)
}

/** POST /api/measurements: one row per site for the date; a site already logged that date is replaced. */
export async function logMeasurements(deps: Deps, input: MeasurementsCreate): Promise<Measurement[]> {
  const { db } = deps
  const ids = input.entries.map((e) => e.id)
  const stored = await db.select({ id: measurements.id }).from(measurements).where(inArray(measurements.id, ids))
  const replayed = new Set(stored.map((r) => r.id))
  const fresh = input.entries.filter((e) => !replayed.has(e.id))
  const select = db.select().from(measurements).where(inArray(measurements.id, ids))
  if (fresh.length === 0) return (await select).map(toMeasurement)
  assertPast(deps, input.date)

  const sites = fresh.map((e) => e.site)
  const [, , rows] = await db.batch([
    db.delete(measurements).where(and(eq(measurements.date, input.date), inArray(measurements.site, sites))),
    db.insert(measurements).values(fresh.map((e) => ({ id: e.id, date: input.date, site: e.site, value_cm: e.value_cm, actor: deps.actor }))),
    select,
  ])
  const order = new Map(ids.map((id, i) => [id, i]))
  return rows.map(toMeasurement).sort((a, b) => order.get(a.id)! - order.get(b.id)!)
}

/** GET /api/trend: daily raw + trend weights for the range, the 7-day trend change, tape, forecast and milestones. */
export function getTrend(deps: Deps, range: DateRange): Promise<TrendSeries> {
  return buildTrend(deps, range)
}
