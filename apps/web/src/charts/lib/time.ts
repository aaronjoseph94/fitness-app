// Owns: the time axis for line charts over dates — date → timestamp rows and readable tick positions
// (monthly ticks for long spans, weekly for medium, every few days for short).
import { dateToTime, formatMonth, formatShortDate } from '../../components'

const DAY = 86_400_000

export interface TimeAxis {
  domain: [number, number]
  ticks: number[]
  format: (t: number) => string
}

export function timeAxis(times: readonly number[]): TimeAxis {
  // A single point gets a day either side so the axis is never degenerate.
  const min = Math.min(...times) - (new Set(times).size === 1 ? DAY : 0)
  const max = Math.max(...times) + (new Set(times).size === 1 ? DAY : 0)
  const span = (max - min) / DAY
  const ticks: number[] = []
  if (span > 100) {
    const d = new Date(min)
    let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
    const step = span > 330 ? 2 : 1
    while (t <= max) {
      ticks.push(t)
      const n = new Date(t)
      t = Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + step, 1)
    }
    return { domain: [min, max], ticks, format: (x) => formatMonth(x) }
  }
  const step = span > 45 ? 14 : span > 14 ? 7 : span > 6 ? 2 : 1
  for (let t = min; t <= max; t += step * DAY) ticks.push(t)
  return { domain: [min, max], ticks, format: (x) => formatShortDate(x) }
}

export { dateToTime, DAY }
