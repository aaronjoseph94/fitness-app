// Owns: the column mapping for a health export (SPEC §8 route 2) — guessing which columns hold the date, steps,
// active energy, sleep start/end and minutes or hours asleep, and turning the table into HealthImport rows (one per
// date; several rows on one date add up), with the rows it had to skip and why.
import { HealthImportRow, type HealthImportMapping } from '@fitness/shared/schemas'
import { instantAt, shiftDate } from '../../quick-log'
import type { Table } from './table'

export type Mapping = HealthImportMapping

const find = (columns: readonly string[], ...patterns: RegExp[]) => {
  for (const p of patterns) {
    const hit = columns.find((c) => p.test(c))
    if (hit) return hit
  }
  return null
}

/** Best guess per value from the column names (Health Auto Export CSV/JSON names first, then generic ones). */
export function guessMapping(table: Table): Mapping {
  const cols = table.columns
  const asleep = find(cols, /asleep\b.*\(hr\)|\[asleep\]/i, /totalSleep|total sleep|sleep.*total/i, /\basleep/i, /sleep.*(hr|hours|min)/i)
  const values = asleep ? table.rows.map((r) => Number(r[asleep])).filter(Number.isFinite) : []
  const hoursLike = asleep !== null && (/\(hr\)|hours?\b|\bh\)/i.test(asleep) || (values.length > 0 && Math.max(...values) <= 24))
  return {
    date: find(cols, /^date$/i, /^date\/time$/i, /^day$/i, /date/i, /^start/i) ?? cols[0] ?? 'date',
    steps: find(cols, /step.?count.*qty/i, /step/i),
    active_kcal: find(cols, /active.?energy.*qty/i, /active.?(energy|kcal|cal)/i),
    in_bed_at: find(cols, /inBedStart/i, /sleepStart/i, /in.?bed.*start|bed.?time/i, /sleep.*start/i),
    woke_at: find(cols, /inBedEnd/i, /sleepEnd/i, /wake|woke/i, /in.?bed.*end|sleep.*end/i),
    asleep,
    asleep_unit: hoursLike ? 'h' : 'min',
  }
}

const number = (raw: string | undefined): number | null => {
  if (raw === undefined) return null
  const t = raw.replace(/[\s,]/g, '')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** A local date from "2026-10-01", "2026-10-01 00:00:00 -0600", "2026-10-01T…", or US "10/1/2026". */
export function parseDate(raw: string | undefined): string | null {
  if (!raw) return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim())
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw.trim())
  if (us) return `${us[3]}-${us[1]!.padStart(2, '0')}-${us[2]!.padStart(2, '0')}`
  return null
}

/**
 * An instant from "2026-10-01 22:45:00 -0600", ISO 8601 with an offset, a local "2026-10-01 22:45" (Edmonton), or a
 * bare "22:45" on `date` (a bedtime after the wake time on the clock is the evening before).
 */
export function parseInstant(raw: string | undefined, date: string, kind: 'bed' | 'wake', wakeClock?: string): string | null {
  if (!raw) return null
  const t = raw.trim()
  const withOffset = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)\s*(Z|[+-]\d{2}:?\d{2})$/.exec(t)
  if (withOffset) {
    const off = withOffset[3] === 'Z' ? 'Z' : withOffset[3]!.replace(/^([+-]\d{2})(\d{2})$/, '$1:$2')
    const time = withOffset[2]!.length === 5 ? `${withOffset[2]}:00` : withOffset[2]
    const d = new Date(`${withOffset[1]}T${time}${off}`)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  const local = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(t)
  if (local) return instantAt(local[1]!, local[2]!)
  const clock = /^(\d{1,2}):(\d{2})/.exec(t)
  if (clock) {
    const hhmm = `${clock[1]!.padStart(2, '0')}:${clock[2]}`
    const day = kind === 'bed' && wakeClock !== undefined && hhmm > wakeClock ? shiftDate(date, -1) : date
    return instantAt(day, hhmm)
  }
  return null
}

export interface Mapped {
  rows: HealthImportRow[]
  /** Rows dropped, with the first few reasons. */
  skipped: number
  reasons: string[]
}

/** Apply the mapping: one HealthImportRow per date (steps and energy add up; sleep keeps the longest night). */
export function applyMapping(table: Table, m: Mapping): Mapped {
  const byDate = new Map<string, HealthImportRow>()
  let skipped = 0
  const reasons: string[] = []
  const skip = (why: string) => {
    skipped++
    if (reasons.length < 5) reasons.push(why)
  }
  for (const [i, r] of table.rows.entries()) {
    const date = parseDate(r[m.date])
    if (!date) {
      skip(`Row ${i + 2}: no date in "${m.date}"`)
      continue
    }
    const steps = m.steps ? number(r[m.steps]) : null
    const kcal = m.active_kcal ? number(r[m.active_kcal]) : null
    const asleepRaw = m.asleep ? number(r[m.asleep]) : null
    const wakeRaw = m.woke_at ? r[m.woke_at] : undefined
    const wokeAt = parseInstant(wakeRaw, date, 'wake')
    const wakeClock = /(\d{1,2}):(\d{2})/.exec(wakeRaw ?? '')
    const inBedAt = m.in_bed_at ? parseInstant(r[m.in_bed_at], date, 'bed', wakeClock ? `${wakeClock[1]!.padStart(2, '0')}:${wakeClock[2]}` : undefined) : null
    const candidate: HealthImportRow = { date }
    if (steps !== null && steps > 0) candidate.steps = Math.round(steps)
    if (kcal !== null && kcal > 0) candidate.active_kcal = Math.round(kcal)
    if (asleepRaw !== null && asleepRaw > 0) candidate.asleep_min = Math.round(m.asleep_unit === 'h' ? asleepRaw * 60 : asleepRaw)
    if (inBedAt && wokeAt && inBedAt < wokeAt) {
      candidate.in_bed_at = inBedAt
      candidate.woke_at = wokeAt
    }
    if (Object.keys(candidate).length === 1) {
      skip(`Row ${i + 2} (${date}): nothing mapped`)
      continue
    }
    const prev = byDate.get(date)
    const merged: HealthImportRow = prev
      ? {
          date,
          steps: prev.steps !== undefined || candidate.steps !== undefined ? (prev.steps ?? 0) + (candidate.steps ?? 0) : undefined,
          active_kcal: prev.active_kcal !== undefined || candidate.active_kcal !== undefined ? (prev.active_kcal ?? 0) + (candidate.active_kcal ?? 0) : undefined,
          asleep_min: Math.max(prev.asleep_min ?? 0, candidate.asleep_min ?? 0) || undefined,
          in_bed_at: candidate.in_bed_at ?? prev.in_bed_at,
          woke_at: candidate.woke_at ?? prev.woke_at,
        }
      : candidate
    const valid = HealthImportRow.safeParse(Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined)))
    if (!valid.success) {
      skip(`Row ${i + 2} (${date}): ${valid.error.issues[0]?.message ?? 'invalid'}`)
      continue
    }
    byDate.set(date, valid.data)
  }
  return { rows: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)), skipped, reasons }
}
