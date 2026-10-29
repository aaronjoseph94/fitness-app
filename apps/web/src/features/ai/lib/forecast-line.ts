// Owns: the reply's "What changed" line (pure) — how a dump moved the forecast, as "Projected summit Nov 30 → Dec 4 ·
// −0.6 kg/wk" (the summit word from the copy layer; a date in another year keeps it), or nothing when the message moved
// nothing or the move rounds away (same finish date, same rate to 0.1 kg/wk).
import { today } from '@fitness/shared/engine'
import type { ForecastShift } from '@fitness/shared/schemas'
import { formatShortDate, formatSigned } from '../../../components'
import { askAiCopy } from '../../../copy/ask-ai'

export function forecastLine(shift: ForecastShift | null, now: number = Date.now()): string | null {
  if (!shift) return null
  const { before, after } = shift
  const day = (d: string | null) => (d === null ? askAiCopy.noDate : formatShortDate(d, today(now)))
  const rate = formatSigned(after.weekly_rate_kg, 1)
  if (before && before.finish_date === after.finish_date && formatSigned(before.weekly_rate_kg, 1) === rate)
    return null
  const from = before && before.finish_date !== after.finish_date ? day(before.finish_date) : null
  return askAiCopy.projected(from, day(after.finish_date), rate)
}
