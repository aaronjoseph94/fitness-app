// Owns: water quick-add entries (instant + its Edmonton date; day totals are computed).
import * as z from 'zod'
import { Id, Instant, LocalDate, Ml, Row } from './common'

const WaterAmountMl = Ml.min(1).max(5000)

export const WaterLog = Row.extend({ date: LocalDate, logged_at: Instant, amount_ml: WaterAmountMl })
export type WaterLog = z.infer<typeof WaterLog>

/** Body of POST /api/water. `logged_at` defaults to now; the PWA always sends it so a queued entry keeps its time. */
export const WaterLogCreate = z.object({ id: Id, amount_ml: WaterAmountMl, logged_at: Instant.optional() })
export type WaterLogCreate = z.infer<typeof WaterLogCreate>
