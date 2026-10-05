// Owns: the bulk upsert behind a health import page (up to 1,000 mapped rows). Each table gets ONE statement that
// reads the rows from a single JSON parameter with json_each, so a page costs two D1 queries and three bound
// parameters no matter how many rows it has (the 100-parameter and per-invocation query limits never bite). Raw D1
// statements, because Drizzle's batch cannot carry a raw INSERT … SELECT … ON CONFLICT.
import type { Actor, HealthImport, HealthImportResult } from '@fitness/shared/schemas'
import type { Db } from '../../../db'
import { minutesInBed } from './rows'

type StepRow = { id: string; date: string; steps: number; active_kcal: number | null }
type SleepRow = { id: string; date: string; in_bed_at: string | null; woke_at: string | null; asleep_min: number }

/**
 * Upsert by date. A row with `steps` upserts that date's steps (active_kcal kept when the row has none); a row with
 * asleep minutes (given, or woke − in bed) upserts that night's sleep (date = the row's date, the wake date); a row
 * with neither is skipped. Several rows for one date: the last wins.
 */
export async function upsertImport(db: Db, actor: Actor, now: string, input: HealthImport): Promise<HealthImportResult> {
  const steps = new Map<string, StepRow>()
  const sleep = new Map<string, SleepRow>()
  let skipped = 0
  for (const r of input.rows) {
    const asleep = r.asleep_min ?? minutesInBed(r.in_bed_at, r.woke_at)
    if (r.steps !== undefined)
      steps.set(r.date, { id: crypto.randomUUID(), date: r.date, steps: r.steps, active_kcal: r.active_kcal ?? null })
    if (asleep !== null)
      sleep.set(r.date, {
        id: crypto.randomUUID(),
        date: r.date,
        in_bed_at: r.in_bed_at ?? null,
        woke_at: r.woke_at ?? null,
        asleep_min: asleep,
      })
    if (r.steps === undefined && asleep === null) skipped++
  }

  const d1 = db.$client
  const statements: D1PreparedStatement[] = []
  if (steps.size > 0)
    statements.push(
      d1
        .prepare(
          `INSERT INTO step_logs (id, date, steps, active_kcal, source, actor, created_at, updated_at)
           SELECT json_extract(value, '$.id'), json_extract(value, '$.date'), json_extract(value, '$.steps'),
                  json_extract(value, '$.active_kcal'), 'import', ?2, ?3, ?3
           FROM json_each(?1) WHERE true
           ON CONFLICT(date) DO UPDATE SET steps = excluded.steps,
             active_kcal = coalesce(excluded.active_kcal, step_logs.active_kcal),
             source = excluded.source, actor = excluded.actor, updated_at = excluded.updated_at`,
        )
        .bind(JSON.stringify([...steps.values()]), actor, now),
    )
  if (sleep.size > 0)
    statements.push(
      d1
        .prepare(
          `INSERT INTO sleep_logs (id, date, in_bed_at, woke_at, asleep_min, source, actor, created_at, updated_at)
           SELECT json_extract(value, '$.id'), json_extract(value, '$.date'), json_extract(value, '$.in_bed_at'),
                  json_extract(value, '$.woke_at'), json_extract(value, '$.asleep_min'), 'import', ?2, ?3, ?3
           FROM json_each(?1) WHERE true
           ON CONFLICT(date) DO UPDATE SET in_bed_at = excluded.in_bed_at, woke_at = excluded.woke_at,
             asleep_min = excluded.asleep_min, source = excluded.source, actor = excluded.actor,
             updated_at = excluded.updated_at`,
        )
        .bind(JSON.stringify([...sleep.values()]), actor, now),
    )
  if (statements.length > 0) await d1.batch(statements)
  return { steps_upserted: steps.size, sleep_upserted: sleep.size, skipped }
}
