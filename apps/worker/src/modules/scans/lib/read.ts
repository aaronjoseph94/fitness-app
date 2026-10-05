// Owns: reading scans as the API returns them — the rows and their segments, the confirmed scans in scan order, and the
// Scan view: signed sheet URL, the extraction job of an unconfirmed scan, and for a confirmed one the engine comparisons
// and flags (computed on read) plus the stored debrief and the state of its scan_analysis job.
import type { Scan, ScanAnalysis, ScanExtraction } from '@fitness/shared/schemas'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { ai_events, ai_jobs, scan_segments, scans } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { signFileUrl } from '../../files'
import { inScanOrder, neighbours, scanChange, scanFlags, type ConfirmedScan } from './analysis'
import { DebriefNoteBody } from './note'
import { toDraft, toRecord, type ScanRow, type SegmentRow } from './rows'

export interface ScanStore {
  /** Newest first. */
  rows: ScanRow[]
  segments: Map<string, SegmentRow[]>
  /** Confirmed scans in scan order (oldest first). */
  confirmed: ConfirmedScan[]
}

export async function loadStore(deps: Deps): Promise<ScanStore> {
  const { db } = deps
  const [rows, segs] = await db.batch([db.select().from(scans).orderBy(desc(scans.scanned_at)), db.select().from(scan_segments)])
  const segments = new Map<string, SegmentRow[]>()
  for (const s of segs) segments.set(s.scan_id, [...(segments.get(s.scan_id) ?? []), s])
  const confirmed = inScanOrder(
    rows.flatMap((row) => {
      const record = toRecord(row, segments.get(row.id) ?? [])
      return record ? [{ id: row.id, record }] : []
    }),
  )
  return { rows, segments, confirmed }
}

const scanIdOf = (payload: unknown) => (payload as { scan_id?: unknown } | null)?.scan_id

/** Jobs of `type` about these scans, newest first (`statuses` narrows the read to the ai_jobs status index). */
async function jobsFor(deps: Deps, type: 'scan_extract' | 'scan_analysis', scanIds: string[], statuses?: ('queued' | 'running' | 'failed')[]) {
  if (scanIds.length === 0) return []
  return deps.db
    .select({ id: ai_jobs.id, status: ai_jobs.status, attempts: ai_jobs.attempts, error: ai_jobs.error, payload: ai_jobs.payload, created_at: ai_jobs.created_at })
    .from(ai_jobs)
    .where(
      and(
        statuses ? inArray(ai_jobs.status, statuses) : undefined,
        eq(ai_jobs.type, type),
        inArray(sql`json_extract(${ai_jobs.payload}, '$.scan_id')`, scanIds),
      ),
    )
    .orderBy(desc(ai_jobs.created_at))
}

/** Latest debrief note per scan (notes on the scans' dates; the ai_events date index keeps the read small). */
async function debriefNotes(deps: Deps, rows: readonly ScanRow[]) {
  const dates = [...new Set(rows.map((r) => r.date))]
  if (dates.length === 0) return new Map<string, { body: DebriefNoteBody; job_id: string | null; created_at: string }>()
  const notes = await deps.db
    .select({ body: ai_events.body, job_id: ai_events.job_id, created_at: ai_events.created_at })
    .from(ai_events)
    .where(and(eq(ai_events.kind, 'note'), inArray(ai_events.date, dates)))
    .orderBy(desc(ai_events.created_at))
  const byScan = new Map<string, { body: DebriefNoteBody; job_id: string | null; created_at: string }>()
  for (const n of notes) {
    const body = DebriefNoteBody.safeParse(n.body)
    if (body.success && !byScan.has(body.data.scan_id)) byScan.set(body.data.scan_id, { body: body.data, job_id: n.job_id, created_at: n.created_at })
  }
  return byScan
}

async function sheetUrl(deps: Deps, row: ScanRow): Promise<string | null> {
  if (!row.storage_path) return null
  try {
    return (await signFileUrl(deps.env, row.storage_path, undefined, deps.now())).url
  } catch (e) {
    console.warn(`scan ${row.id}: sheet URL not signed (${e instanceof Error ? e.message : String(e)})`)
    return null
  }
}

/** The Scan views of `rows` (in the given order), reading job and debrief state in a few queries. */
export async function toViews(deps: Deps, store: ScanStore, rows: readonly ScanRow[]): Promise<Scan[]> {
  const confirmedIds = new Set(store.confirmed.map((s) => s.id))
  const unconfirmed = rows.filter((r) => !confirmedIds.has(r.id)).map((r) => r.id)
  const confirmedRows = rows.filter((r) => confirmedIds.has(r.id))
  const [extractJobs, analysisJobs, notes] = await Promise.all([
    jobsFor(deps, 'scan_extract', unconfirmed),
    jobsFor(
      deps,
      'scan_analysis',
      confirmedRows.map((r) => r.id),
      ['queued', 'running', 'failed'],
    ),
    debriefNotes(deps, confirmedRows),
  ])

  return Promise.all(
    rows.map(async (row): Promise<Scan> => {
      const confirmed = confirmedIds.has(row.id)
      const record = confirmed ? (store.confirmed.find((s) => s.id === row.id)?.record ?? null) : null
      let extraction: ScanExtraction | null = null
      let analysis: ScanAnalysis | null = null
      if (!confirmed) {
        const job = extractJobs.find((j) => scanIdOf(j.payload) === row.id)
        if (job) extraction = { job_id: job.id, status: job.status, attempts: job.attempts, error: job.error }
      } else if (record) {
        const { previous, baseline } = neighbours(store.confirmed, row.id)
        const self = { id: row.id, record }
        const vs_previous = previous ? scanChange(previous, self) : null
        const vs_baseline = baseline ? scanChange(baseline, self) : null
        const job = analysisJobs.find((j) => scanIdOf(j.payload) === row.id)
        const note = notes.get(row.id)
        const status: ScanAnalysis['status'] =
          job && job.status !== 'failed' ? 'pending' : job && (!note || job.created_at > note.created_at) ? 'failed' : note ? 'done' : 'none'
        analysis = {
          vs_previous,
          vs_baseline,
          flags: scanFlags(record, vs_previous),
          status,
          job_id: status === 'pending' || status === 'failed' ? job!.id : (note?.job_id ?? null),
          narrative: note?.body.text ?? null,
          narrative_by: note?.body.narrative_by ?? null,
          proposal_ids: note?.body.proposal_ids ?? [],
          milestone_updates: note?.body.milestone_updates ?? [],
        }
      }
      return {
        id: row.id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        date: row.date,
        sheet_url: await sheetUrl(deps, row),
        confirmed: record !== null,
        extracted: toDraft(row),
        record,
        extraction,
        analysis,
      }
    }),
  )
}
