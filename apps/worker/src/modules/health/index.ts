// Owns: the health module's interface — Apple Watch inputs (SPEC §8): sleep (one row per night, date = wake date) and
// steps (one row per date) from the manual form, the iOS Shortcut webhook and file imports. Everything upserts by date;
// manual creates are also idempotent by their client id (a replay returns the stored row). A date after today (Edmonton)
// is refused: steps and sleep are what happened.
// Interface:
//   logSleep(deps, SleepLogCreate)      → SleepLog
//   logSteps(deps, StepLogCreate)       → StepLog
//   ingestHealth(deps, HealthIngest)    → HealthIngestResult   the iOS Shortcut webhook (POST /api/ingest/health)
//   importHealth(deps, HealthImport)    → HealthImportResult   a file import
//   sleepOn(deps, date) / stepsOn(deps, date) → SleepLog | null / StepLog | null   that date's row
//   deleteSleep(deps, id, restore?) / deleteSteps(deps, id, restore?) → Ok   remove the row; with `restore` (what that
//        date held before, e.g. an Ask AI receipt's `before`) put that row back, unless the date has been logged again
//        since. Deleting an id that is gone is a no-op.
import { localDate, today } from '@fitness/shared/engine'
import type {
  HealthImport,
  HealthImportResult,
  HealthIngest,
  HealthIngestResult,
  Ok,
  SleepLog,
  SleepLogCreate,
  StepLog,
  StepLogCreate,
} from '@fitness/shared/schemas'
import { eq, sql } from 'drizzle-orm'
import { runBatch, sleep_logs, step_logs } from '../../db'
import type { Deps } from '../../lib/deps'
import { badRequest } from '../../lib/http-error'
import { upsertImport } from './lib/import'
import { minutesInBed, toSleepLog, toStepLog } from './lib/rows'

/** A device clock a few minutes ahead of the Worker's at midnight still logs "today". */
const CLOCK_SKEW_MS = 5 * 60_000

/** 400 when `date` is after today in Edmonton. */
function assertPast(deps: Deps, date: string): void {
  if (date > today(new Date(deps.now().getTime() + CLOCK_SKEW_MS)))
    throw badRequest(`${date} has not happened yet; log today or an earlier day`)
}

/** POST /api/sleep: last night's sleep for its wake date, replacing any other entry for that date. */
export async function logSleep(deps: Deps, input: SleepLogCreate): Promise<SleepLog> {
  const { db } = deps
  const [existing] = await db.select().from(sleep_logs).where(eq(sleep_logs.id, input.id))
  if (existing) return toSleepLog(existing)
  assertPast(deps, input.date)
  const [, , [row]] = await db.batch([
    db.delete(sleep_logs).where(eq(sleep_logs.date, input.date)),
    db.insert(sleep_logs).values({
      id: input.id,
      date: input.date,
      in_bed_at: input.in_bed_at ?? null,
      woke_at: input.woke_at ?? null,
      asleep_min: input.asleep_min ?? minutesInBed(input.in_bed_at, input.woke_at),
      source: 'manual',
      stages: input.stages ?? null,
      actor: deps.actor,
    }),
    db.select().from(sleep_logs).where(eq(sleep_logs.id, input.id)),
  ])
  return toSleepLog(row!)
}

/** POST /api/steps: a day's steps, replacing any other entry for that date. */
export async function logSteps(deps: Deps, input: StepLogCreate): Promise<StepLog> {
  const { db } = deps
  const [existing] = await db.select().from(step_logs).where(eq(step_logs.id, input.id))
  if (existing) return toStepLog(existing)
  assertPast(deps, input.date)
  const [, , [row]] = await db.batch([
    db.delete(step_logs).where(eq(step_logs.date, input.date)),
    db.insert(step_logs).values({
      id: input.id,
      date: input.date,
      steps: input.steps,
      active_kcal: input.active_kcal ?? null,
      source: 'manual',
      actor: deps.actor,
    }),
    db.select().from(step_logs).where(eq(step_logs.id, input.id)),
  ])
  return toStepLog(row!)
}

/**
 * POST /api/ingest/health (iOS Shortcut, each morning): `date`'s steps, and the night in `sleep` filed under its wake
 * date (the Edmonton date of woke_at). Upserts by date and keeps the row id, so sending the same day twice is a no-op.
 */
export async function ingestHealth(deps: Deps, input: HealthIngest): Promise<HealthIngestResult> {
  const { db } = deps
  const now = deps.now().toISOString()
  const sleepDate = input.sleep ? localDate(input.sleep.woke_at) : null
  assertPast(deps, input.date)
  if (sleepDate) assertPast(deps, sleepDate)
  const upsertSteps = db
    .insert(step_logs)
    .values({
      date: input.date,
      steps: input.steps,
      active_kcal: input.active_kcal ?? null,
      source: 'watch_webhook',
      actor: deps.actor,
    })
    .onConflictDoUpdate({
      target: step_logs.date,
      set: {
        steps: sql`excluded.steps`,
        active_kcal: sql`coalesce(excluded.active_kcal, ${step_logs.active_kcal})`,
        source: sql`excluded.source`,
        actor: sql`excluded.actor`,
        updated_at: now,
      },
    })
  const selectSteps = db.select().from(step_logs).where(eq(step_logs.date, input.date))

  if (!input.sleep || !sleepDate) {
    const [, [steps]] = await db.batch([upsertSteps, selectSteps])
    return { date: input.date, steps: toStepLog(steps!), sleep: null }
  }
  const [, , [steps], [sleep]] = await db.batch([
    upsertSteps,
    db
      .insert(sleep_logs)
      .values({
        date: sleepDate,
        in_bed_at: input.sleep.in_bed_at,
        woke_at: input.sleep.woke_at,
        asleep_min: input.sleep.asleep_min,
        source: 'watch_webhook',
        actor: deps.actor,
      })
      .onConflictDoUpdate({
        target: sleep_logs.date,
        set: {
          in_bed_at: sql`excluded.in_bed_at`,
          woke_at: sql`excluded.woke_at`,
          asleep_min: sql`excluded.asleep_min`,
          source: sql`excluded.source`,
          actor: sql`excluded.actor`,
          updated_at: now,
        },
      }),
    selectSteps,
    db.select().from(sleep_logs).where(eq(sleep_logs.date, sleepDate)),
  ])
  return { date: input.date, steps: toStepLog(steps!), sleep: toSleepLog(sleep!) }
}

/** POST /api/imports/health: one page of mapped export rows, upserted by date (see lib/import for the rules). */
export function importHealth(deps: Deps, input: HealthImport): Promise<HealthImportResult> {
  return upsertImport(deps.db, deps.actor, deps.now().toISOString(), input)
}

/** The night stored for wake date `date`, if any. */
export async function sleepOn(deps: Deps, date: string): Promise<SleepLog | null> {
  const [row] = await deps.db.select().from(sleep_logs).where(eq(sleep_logs.date, date))
  return row ? toSleepLog(row) : null
}

/** The steps stored for `date`, if any. */
export async function stepsOn(deps: Deps, date: string): Promise<StepLog | null> {
  const [row] = await deps.db.select().from(step_logs).where(eq(step_logs.date, date))
  return row ? toStepLog(row) : null
}

/**
 * Remove sleep entry `id`; with `restore`, put that earlier night back in the same batch. The restore is a conditional
 * write (ON CONFLICT DO NOTHING on the date): a night logged for that date since (the Shortcut, a form) is kept.
 */
export async function deleteSleep(deps: Deps, id: string, restore: SleepLog | null = null): Promise<Ok> {
  const { db } = deps
  await runBatch(db, [
    db.delete(sleep_logs).where(eq(sleep_logs.id, id)),
    ...(restore
      ? [
          db
            .insert(sleep_logs)
            .values({
              id: restore.id,
              date: restore.date,
              in_bed_at: restore.in_bed_at,
              woke_at: restore.woke_at,
              asleep_min: restore.asleep_min,
              source: restore.source,
              stages: restore.stages,
              actor: deps.actor,
              created_at: restore.created_at,
              updated_at: deps.now().toISOString(),
            })
            .onConflictDoNothing(),
        ]
      : []),
  ])
  return { ok: true }
}

/** Remove steps entry `id`; with `restore`, put that earlier entry back unless the date has been logged since. */
export async function deleteSteps(deps: Deps, id: string, restore: StepLog | null = null): Promise<Ok> {
  const { db } = deps
  await runBatch(db, [
    db.delete(step_logs).where(eq(step_logs.id, id)),
    ...(restore
      ? [
          db
            .insert(step_logs)
            .values({
              id: restore.id,
              date: restore.date,
              steps: restore.steps,
              active_kcal: restore.active_kcal,
              source: restore.source,
              actor: deps.actor,
              created_at: restore.created_at,
              updated_at: deps.now().toISOString(),
            })
            .onConflictDoNothing(),
        ]
      : []),
  ])
  return { ok: true }
}
