// Owns: the mapping between `scans` + `scan_segments` rows and the contract's ScanRecord / ScanDraft (LLM-fed JSON is
// parsed with its schema on read), and the columns and five segment rows a confirmed record is written as.
import { localDate } from '@fitness/shared/engine'
import { ScanDraft, ScanMetrics, ScanRecord, ScanSegment, type ScanConditions } from '@fitness/shared/schemas'
import { scan_segments, scans, type NewRow, type Row } from '../../../db'

export type ScanRow = Row<typeof scans>
export type SegmentRow = Row<typeof scan_segments>

const METRIC_KEYS = ScanMetrics.keyof().options

/** The confirmed record of a scan row and its segments; null when unconfirmed or when the stored values fail the schema. */
export function toRecord(row: ScanRow, segments: readonly SegmentRow[]): ScanRecord | null {
  if (!row.confirmed) return null
  const parsed = ScanRecord.safeParse({
    scanned_at: row.scanned_at,
    source: row.source,
    source_units: row.source_units,
    height_cm: row.height_cm,
    age: row.age,
    sex: row.sex,
    ...Object.fromEntries(METRIC_KEYS.map((k) => [k, row[k]])),
    segments: Object.fromEntries(segments.map((s) => [s.segment, { lean_kg: s.lean_kg, fat_kg: s.fat_kg }])),
    conditions: row.conditions ?? { time_of_day: 'morning', fasted: null, hours_since_training: null, notes: null },
  })
  if (!parsed.success) console.warn(`scan ${row.id} is confirmed but does not match ScanRecord; shown unconfirmed`)
  return parsed.success ? parsed.data : null
}

/** The stored extraction draft, or null when there is none (or it no longer matches its schema). */
export function toDraft(row: ScanRow): ScanDraft | null {
  if (row.extracted == null) return null
  const parsed = ScanDraft.safeParse(row.extracted)
  return parsed.success ? parsed.data : null
}

/** Columns of `scans` a confirmed record sets (metrics, identity, conditions; date = Edmonton date of scanned_at). */
export function recordColumns(record: ScanRecord): Partial<NewRow<typeof scans>> & { conditions: ScanConditions } {
  const { segments: _segments, ...columns } = record
  return { ...columns, date: localDate(record.scanned_at), confirmed: true }
}

/** The five scan_segments rows of a record (a re-confirm deletes the old rows in the same batch). */
export function segmentRows(scanId: string, record: ScanRecord): NewRow<typeof scan_segments>[] {
  return ScanSegment.options.map((segment) => ({
    id: crypto.randomUUID(),
    scan_id: scanId,
    segment,
    lean_kg: record.segments[segment].lean_kg,
    fat_kg: record.segments[segment].fat_kg,
  }))
}
