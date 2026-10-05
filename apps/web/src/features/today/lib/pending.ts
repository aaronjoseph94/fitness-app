// Owns: what Today adds on top of the server's day while logs wait in the offline queue — water added, a weigh-in,
// meals, a fast started or ended, steps and sleep — read from the queued writes' bodies (pure; no React).
import { endpoints, type Endpoint } from '@fitness/shared/api'
import { localDate } from '@fitness/shared/engine'
import { MealCreate, SleepLogCreate, StepLogCreate, WaterLogCreate, WeighInCreate, type LocalDate } from '@fitness/shared/schemas'
import type { PendingWrite } from '../../../offline'

export interface PendingToday {
  /** Queued writes that change this date. */
  count: number
  /** Water queued for this date, ml. */
  waterMl: number
  /** The latest queued weigh-in for this date, kg. */
  weighInKg: number | null
  /** Meals queued for this date (their nutrition is known once the Worker has them). */
  meals: number
  /** The latest queued fast action. */
  fast: 'started' | 'ended' | null
  steps: number | null
  sleepMin: number | null
}

const NO_PENDING: PendingToday = { count: 0, waterMl: 0, weighInKg: null, meals: 0, fast: null, steps: null, sleepMin: null }

/** '/api/fasts/:id/end' → /^\/api\/fasts\/[^/]+\/end$/ */
function matcher(endpoint: Endpoint): (write: PendingWrite) => boolean {
  const pattern = new RegExp(`^${endpoint.path.replace(/:[A-Za-z_]+/g, '[^/]+')}$`)
  return (write) => write.method === endpoint.method && pattern.test(write.path.split('?')[0] ?? write.path)
}

const isWater = matcher(endpoints.water.create)
const isWeighIn = matcher(endpoints.body.createWeight)
const isMeal = matcher(endpoints.nutrition.createMeal)
const isFastStart = matcher(endpoints.fasting.start)
const isFastEnd = matcher(endpoints.fasting.end)
const isSteps = matcher(endpoints.health.createSteps)
const isSleep = matcher(endpoints.health.createSleep)

/** Queued writes, oldest first, folded into what they change on `date` (later writes win). */
export function pendingFor(writes: readonly PendingWrite[], date: LocalDate): PendingToday {
  const out: PendingToday = { ...NO_PENDING }
  for (const write of writes) {
    if (isWater(write)) {
      const body = WaterLogCreate.safeParse(write.body)
      if (body.success && localDate(body.data.logged_at ?? write.created_at) === date) {
        out.waterMl += body.data.amount_ml
        out.count++
      }
    } else if (isWeighIn(write)) {
      const body = WeighInCreate.safeParse(write.body)
      if (body.success && body.data.date === date) {
        out.weighInKg = body.data.weight_kg
        out.count++
      }
    } else if (isMeal(write)) {
      const body = MealCreate.safeParse(write.body)
      if (body.success && localDate(body.data.eaten_at) === date) {
        out.meals++
        out.count++
      }
    } else if (isFastStart(write)) {
      out.fast = 'started'
      out.count++
    } else if (isFastEnd(write)) {
      out.fast = 'ended'
      out.count++
    } else if (isSteps(write)) {
      const body = StepLogCreate.safeParse(write.body)
      if (body.success && body.data.date === date) {
        out.steps = body.data.steps
        out.count++
      }
    } else if (isSleep(write)) {
      const body = SleepLogCreate.safeParse(write.body)
      if (body.success && body.data.date === date) {
        const { asleep_min, in_bed_at, woke_at } = body.data
        out.sleepMin = asleep_min ?? (in_bed_at && woke_at ? Math.round((Date.parse(woke_at) - Date.parse(in_bed_at)) / 60_000) : null)
        out.count++
      }
    }
  }
  return out
}
