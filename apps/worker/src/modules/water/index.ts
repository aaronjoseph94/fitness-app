// Owns: the water module's interface — quick-add water entries stored with their UTC instant and Edmonton local date
// (day totals are computed by v_day). Idempotent by the client id, so a replayed offline write returns the first row.
import { localDate } from '@fitness/shared/engine'
import type { WaterLog, WaterLogCreate } from '@fitness/shared/schemas'
import { eq } from 'drizzle-orm'
import { water_logs, type Row } from '../../db'
import type { Deps } from '../../lib/deps'

/** Log one entry; `logged_at` defaults to now and `date` = its Edmonton local date. */
export async function logWater(deps: Deps, input: WaterLogCreate): Promise<WaterLog> {
  const logged_at = input.logged_at ?? deps.now().toISOString()
  const [, [row]] = await deps.db.batch([
    deps.db
      .insert(water_logs)
      .values({ id: input.id, logged_at, date: localDate(logged_at), amount_ml: input.amount_ml, actor: deps.actor })
      .onConflictDoNothing({ target: water_logs.id }),
    deps.db.select().from(water_logs).where(eq(water_logs.id, input.id)),
  ])
  return toWaterLog(row!)
}

export const toWaterLog = (r: Row<typeof water_logs>): WaterLog => ({
  id: r.id,
  date: r.date,
  logged_at: r.logged_at,
  amount_ml: r.amount_ml,
  created_at: r.created_at,
  updated_at: r.updated_at,
})
