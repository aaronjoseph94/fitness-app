// Owns: Evolt 360 scans end to end (SPEC §2, §3, §8, §9) — the sheet upload (stored in R2 as
// scan-sheets/<scan_id>.<ext>, already name-masked by the browser), the scan_extract job (the Clerk reads the sheet; lb
// converted to kg into the draft), the confirm (metric columns + five segments in one batch), the scan_analysis job
// (engine comparison with the previous scan and the baseline, milestones re-anchored, a short debrief and guarded
// proposals), reads with signed sheet URLs, and the "scan due" note for the nightly cron.
// Interface:
//   uploadScan(deps, { query, body })  → ScanUploaded   idempotent by the client's scan id; queues scan_extract
//   reextractScan(deps, id)            → ScanUploaded   unconfirmed only (409 otherwise)
//   confirmScan(deps, id, patch)       → Scan           every value as Aaron edited it (a new id = manual entry);
//                                                       (re)queues scan_analysis
//   listScans(deps) / getScan(deps, id) → Scan[] / Scan  newest first; comparisons and flags computed on read
//   deleteScan(deps, id)               → Ok             unconfirmed only (409 otherwise); removes the sheet
//   compareScanIds(deps, a, b)         → ScanChange     the later scan against the earlier (tools: compare_scans)
//   scanSchedule(deps)                 → ScanSchedule   last scan, interval, next due date
//   noteScanDue(deps, date)            → { due, noted } nightly: an ai_events note when a scan is due (idempotent)
//   extractScan / analyseScan(deps + { router }, payload)  the two job bodies (registered below; tests call them with
//        a fake router). analyseScan never fails on the router: no LLM answer → the engine's plain debrief.
import { localDate, today } from '@fitness/shared/engine'
import {
  ScanExtractOutput,
  type Ok,
  type PlanChange,
  type PlanTargets,
  type Scan,
  type ScanAnalysisOutput,
  type ScanChange,
  type ScanPatch,
  type ScanUploaded,
  type ScanUploadQuery,
} from '@fitness/shared/schemas'
import { and, eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { progress_photos, scan_segments, scans } from '../../db'
import type { Deps } from '../../lib/deps'
import { HttpError, notFound } from '../../lib/http-error'
import { eventInsert } from '../events'
import { jobInsert, registerJobHandler, runSoon, type JobMeta } from '../jobs'
import { createLlmRouter, type LlmRouter } from '../llm'
import { getActivePlan, propose } from '../plan'
import { getSettings } from '../settings'
import { neighbours, plainNarrative, scanChange, scanFlags, type ConfirmedScan } from './lib/analysis'
import { toDraft } from './lib/convert'
import { reanchorMilestones } from './lib/milestones'
import { DEBRIEF_SYSTEM, DebriefOutput, EXTRACT_PROMPT, EXTRACT_SYSTEM } from './lib/prompts'
import { loadStore, toViews } from './lib/read'
import { recordColumns, segmentRows } from './lib/rows'

export { noteScanDue, scanSchedule, type ScanSchedule } from './lib/due'

/** The scan jobs' deps: the usual bag plus the LLM router (tests pass a fake). */
export type ScanJobDeps = Deps & { router: Pick<LlmRouter, 'complete'> }

/** User-facing jobs run before background work in the sweep. */
const JOB_PRIORITY = 10
/** External fetches one run may make (router retries and failover included); the sweep budgets them. */
const EXTRACT_FETCHES = 6
const ANALYSIS_FETCHES = 6
/** Router deadlines leave room inside the job's 25 s for the reads and writes around the call. */
const EXTRACT_DEADLINE_MS = 20_000
const DEBRIEF_DEADLINE_MS = 15_000
/** At most this many proposals per analysis. */
const MAX_PROPOSALS = 3
/** The engine's own proposal when the lean-loss guard fires and no LLM answered: protein + 10 g/day. */
const GUARD_PROTEIN_STEP_G = 10

const EXTENSION: Record<ScanUploadQuery['content_type'], string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

async function scanRow(deps: Deps, id: string) {
  const [row] = await deps.db.select().from(scans).where(eq(scans.id, id))
  if (!row) throw notFound('Scan')
  return row
}

export async function listScans(deps: Deps): Promise<Scan[]> {
  const store = await loadStore(deps)
  return toViews(deps, store, store.rows)
}

export async function getScan(deps: Deps, id: string): Promise<Scan> {
  const store = await loadStore(deps)
  const row = store.rows.find((r) => r.id === id)
  if (!row) throw notFound('Scan')
  const [view] = await toViews(deps, store, [row])
  return view!
}

/** Run one change as a single db.batch (D1 has no transactions). */
async function runBatch(deps: Deps, statements: BatchItem<'sqlite'>[]): Promise<void> {
  const [first, ...rest] = statements
  if (first) await deps.db.batch([first, ...rest])
}

/** Queue a scan_extract job for `scanId` in one batch with `extra`, and start it after the response. */
async function queueExtraction(deps: Deps, scanId: string, extra: BatchItem<'sqlite'>[] = []): Promise<string> {
  const job = jobInsert(deps, { type: 'scan_extract', payload: { scan_id: scanId }, priority: JOB_PRIORITY })
  await runBatch(deps, [...extra, job.statement])
  runSoon(deps, job.id)
  return job.id
}

/**
 * POST /api/scans: store the (masked) sheet at scan-sheets/<id>.<ext>, insert the unconfirmed scan and queue
 * scan_extract in one batch. A replayed id returns the stored scan and its latest extraction job.
 */
export async function uploadScan(deps: Deps, input: { query: ScanUploadQuery; body: ArrayBuffer }): Promise<ScanUploaded> {
  const { id, content_type } = input.query
  const [existing] = await deps.db.select({ id: scans.id }).from(scans).where(eq(scans.id, id))
  if (existing) {
    const scan = await getScan(deps, id)
    if (scan.extraction) return { scan, job_id: scan.extraction.job_id }
    if (scan.confirmed) throw new HttpError(409, 'scan_confirmed', 'This scan is already confirmed')
    const job_id = await queueExtraction(deps, id)
    return { scan: await getScan(deps, id), job_id }
  }
  const key = `scan-sheets/${id}.${EXTENSION[content_type]}`
  await deps.env.FILES.put(key, input.body, { httpMetadata: { contentType: content_type } })
  const now = deps.now()
  const job_id = await queueExtraction(deps, id, [
    deps.db.insert(scans).values({
      id,
      scanned_at: now.toISOString(),
      date: today(now),
      source: 'evolt360',
      storage_path: key,
      confirmed: false,
      actor: deps.actor,
    }),
  ])
  return { scan: await getScan(deps, id), job_id }
}

/** POST /api/scans/:id/extract: read the stored sheet again. */
export async function reextractScan(deps: Deps, id: string): Promise<ScanUploaded> {
  const row = await scanRow(deps, id)
  if (row.confirmed) throw new HttpError(409, 'scan_confirmed', 'This scan is already confirmed')
  if (!row.storage_path) throw new HttpError(422, 'no_sheet', 'This scan has no stored sheet; enter the values instead')
  const job_id = await queueExtraction(deps, id)
  return { scan: await getScan(deps, id), job_id }
}

/**
 * PATCH /api/scans/:id: the record exactly as Aaron confirmed it (extracted, edited or entered by hand) becomes the
 * metric columns and five scan_segments rows in one batch with a queued scan_analysis job. Re-confirming replaces them;
 * an id with no scan yet is manual entry without a sheet (the row is created).
 */
export async function confirmScan(deps: Deps, id: string, patch: ScanPatch): Promise<Scan> {
  const { db } = deps
  const [existing] = await db.select({ id: scans.id }).from(scans).where(eq(scans.id, id))
  const columns = { ...recordColumns(patch.record), actor: deps.actor, updated_at: deps.now().toISOString() }
  const job = jobInsert(deps, { type: 'scan_analysis', payload: { scan_id: id }, priority: JOB_PRIORITY })
  await db.batch([
    existing ? db.update(scans).set(columns).where(eq(scans.id, id)) : db.insert(scans).values({ ...columns, id, scanned_at: patch.record.scanned_at, date: columns.date! }),
    db.delete(scan_segments).where(eq(scan_segments.scan_id, id)),
    db.insert(scan_segments).values(segmentRows(id, patch.record)),
    job.statement,
  ])
  runSoon(deps, job.id)
  return getScan(deps, id)
}

/** DELETE /api/scans/:id: an unconfirmed scan and its sheet. */
export async function deleteScan(deps: Deps, id: string): Promise<Ok> {
  const row = await scanRow(deps, id)
  if (row.confirmed) throw new HttpError(409, 'scan_confirmed', 'A confirmed scan cannot be discarded')
  const { db } = deps
  await db.batch([
    db.update(progress_photos).set({ nearest_scan_id: null }).where(eq(progress_photos.nearest_scan_id, id)),
    db.delete(scan_segments).where(eq(scan_segments.scan_id, id)),
    db.delete(scans).where(and(eq(scans.id, id), eq(scans.confirmed, false))),
  ])
  if (row.storage_path) await deps.env.FILES.delete(row.storage_path)
  return { ok: true }
}

/** The later of two confirmed scans against the earlier (MCP/Ask AI compare_scans). */
export async function compareScanIds(deps: Deps, a: string, b: string): Promise<ScanChange> {
  const { confirmed } = await loadStore(deps)
  const [first, second] = [a, b].map((id) => {
    const s = confirmed.find((c) => c.id === id)
    if (!s) throw notFound(`Confirmed scan ${id}`)
    return s
  })
  return first!.record.scanned_at <= second!.record.scanned_at ? scanChange(first!, second!) : scanChange(second!, first!)
}

// ── Jobs ──────────────────────────────────────────────────────────────────────────────────────────────────────

const metaOf = (r: { provider: string; model: string; tokens_in: number; tokens_out: number }): JobMeta => ({
  provider: r.provider,
  model: r.model,
  tokens_in: r.tokens_in,
  tokens_out: r.tokens_out,
})

/**
 * scan_extract: the Clerk reads the stored sheet (vision) → ScanExtractOutput in the sheet's units → kg draft in
 * `scans.extracted` (only while unconfirmed). Router errors propagate, so the job retries and then fails; the confirm
 * form offers manual entry meanwhile.
 */
export async function extractScan(deps: ScanJobDeps, input: { scan_id: string }): Promise<{ output: ScanExtractOutput; meta: JobMeta }> {
  const row = await scanRow(deps, input.scan_id)
  // Confirmed (e.g. entered by hand) while this read waited for a retry: don't spend an LLM call on it.
  if (row.confirmed) throw new Error('The scan was confirmed before the sheet was read')
  if (!row.storage_path) throw new Error('The scan has no stored sheet')
  const object = await deps.env.FILES.get(row.storage_path)
  if (!object) throw new Error(`Sheet ${row.storage_path} is missing from storage`)
  const mime = object.httpMetadata?.contentType ?? 'image/jpeg'
  const result = await deps.router.complete({
    job: 'scan_extract',
    system: EXTRACT_SYSTEM,
    messages: [{ role: 'user', content: EXTRACT_PROMPT }],
    images: [{ mime, data: await object.arrayBuffer() }],
    schema: ScanExtractOutput,
    priority: 'user',
    maxTokens: 4096,
    deadlineMs: EXTRACT_DEADLINE_MS,
  })
  const draft = toDraft(result.data)
  await deps.db
    .update(scans)
    .set({ extracted: draft, source_units: draft.source_units, updated_at: deps.now().toISOString() })
    .where(and(eq(scans.id, row.id), eq(scans.confirmed, false)))
  return { output: result.data, meta: metaOf(result) }
}

/** A target's current value in the active plan (a weekday override when it has one). */
function currentTarget(targets: PlanTargets, change: Pick<PlanChange, 'field' | 'weekday'>): number {
  return (change.weekday ? targets.overrides[change.weekday]?.[change.field] : undefined) ?? targets.defaults[change.field]
}

const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp

/** The compact engine summary the Clerk writes the debrief from (numbers rounded; no names, no photos). */
function debriefInput(self: ConfirmedScan, vsPrevious: ScanChange, vsBaseline: ScanChange | null, flags: readonly { message: string }[], targets: PlanTargets, rails: { calorie_floor: number; calorie_ceiling: number; protein_min_g: number }) {
  const r = self.record
  const change = (c: ScanChange) => ({
    since: c.date,
    days: c.days,
    weight_kg: round(c.fat_vs_lean.weight_kg),
    fat_kg: round(c.fat_vs_lean.fat_kg),
    lean_kg: round(c.fat_vs_lean.lean_kg),
    water_kg: round(c.fat_vs_lean.water_kg),
    lean_share_of_loss: c.lean_share_of_loss === null ? null : round(c.lean_share_of_loss),
    lean_loss_guard: c.lean_loss,
    visceral_level: c.deltas.visceral_fat_level ?? null,
    visceral_area_cm2: c.deltas.visceral_fat_area_cm2 === undefined ? null : round(c.deltas.visceral_fat_area_cm2, 0),
    body_fat_pct: c.deltas.body_fat_pct === undefined ? null : round(c.deltas.body_fat_pct, 1),
    segment_fat_kg: Object.fromEntries(Object.entries(c.segments).map(([k, v]) => [k, round(v.fat_kg)])),
    milestones_reached: c.milestones_reached.map((m) => m.label),
  })
  return {
    scan: {
      date: localDate(r.scanned_at),
      weight_kg: r.weight_kg,
      body_fat_pct: r.body_fat_pct,
      body_fat_mass_kg: r.body_fat_mass_kg,
      lean_body_mass_kg: r.lean_body_mass_kg,
      total_body_water_kg: r.total_body_water_kg,
      visceral_fat_level: r.visceral_fat_level,
      visceral_fat_area_cm2: r.visceral_fat_area_cm2,
      conditions: r.conditions,
    },
    vs_previous: change(vsPrevious),
    vs_baseline: vsBaseline && vsBaseline.scan_id !== vsPrevious.scan_id ? change(vsBaseline) : null,
    flags: flags.map((f) => f.message),
    current_targets: { kcal: targets.defaults.kcal, protein_g: targets.defaults.protein_g, steps: targets.defaults.steps },
    rails,
  }
}

/**
 * scan_analysis (actor ai): engine comparison with the previous scan and the baseline, flags, milestones re-anchored;
 * then the Clerk's short debrief and up to three proposals over those numbers (each through plan.propose, so the
 * guards apply; `from` is set from the active plan). If the router fails, the engine's plain debrief is stored instead
 * (plus protein + 10 g when the lean-loss guard fired). One batch writes the milestone updates and the debrief note.
 */
export async function analyseScan(deps: ScanJobDeps, input: { scan_id: string; job_id?: string }): Promise<{ output: ScanAnalysisOutput; meta?: JobMeta }> {
  const ai: Deps = { ...deps, actor: 'ai' }
  const store = await loadStore(deps)
  const self = store.confirmed.find((s) => s.id === input.scan_id)
  if (!self) throw new Error('Only a confirmed scan can be analysed')
  const { previous, baseline } = neighbours(store.confirmed, self.id)
  const vsPrevious = previous ? scanChange(previous, self) : null
  const vsBaseline = baseline ? scanChange(baseline, self) : null
  const flags = scanFlags(self.record, vsPrevious)
  const anchors = await reanchorMilestones(ai, store.confirmed)
  const [plan, view] = await Promise.all([getActivePlan(deps), getSettings(deps)])
  const rails = { calorie_floor: view.settings.calorie_floor, calorie_ceiling: view.settings.calorie_ceiling, protein_min_g: view.settings.protein_min_g }

  let narrative = plainNarrative(self.record, vsPrevious, vsBaseline, flags)
  let narrative_by: 'ai' | 'engine' = 'engine'
  let changes: PlanChange[] = []
  let meta: JobMeta | undefined
  if (vsPrevious) {
    try {
      const result = await deps.router.complete({
        job: 'scan_analysis',
        system: DEBRIEF_SYSTEM,
        messages: [{ role: 'user', content: JSON.stringify(debriefInput(self, vsPrevious, vsBaseline, flags, plan.targets, rails)) }],
        schema: DebriefOutput,
        priority: 'user',
        maxTokens: 1500,
        deadlineMs: DEBRIEF_DEADLINE_MS,
      })
      narrative = result.data.narrative
      narrative_by = 'ai'
      changes = result.data.proposals
      meta = metaOf(result)
    } catch (e) {
      console.warn(`scan_analysis ${self.id}: no LLM debrief, storing the engine's (${e instanceof Error ? e.message : String(e)})`)
      if (vsPrevious.lean_loss === 'lean_loss') {
        const from = plan.targets.defaults.protein_g
        changes = [{ field: 'protein_g', weekday: null, from, to: from + GUARD_PROTEIN_STEP_G, reason: 'Lean-loss guard: lean mass was over 25 % of the weight lost since the last scan' }]
      }
    }
  }

  const date = localDate(self.record.scanned_at)
  const proposed: PlanChange[] = []
  const proposal_ids: string[] = []
  for (const change of changes.slice(0, MAX_PROPOSALS)) {
    const from = currentTarget(plan.targets, change)
    if (from === change.to) continue
    const result = await propose(ai, { changes: [{ ...change, from }], reason: `Scan ${date}: ${change.reason}`.slice(0, 500) })
    if (result.proposal) {
      proposal_ids.push(result.proposal.id)
      proposed.push({ ...change, from })
    }
  }

  const f = vsPrevious?.fat_vs_lean
  const summary = f
    ? `Scan ${date}: fat ${f.fat_kg <= 0 ? '−' : '+'}${Math.abs(f.fat_kg).toFixed(1)} kg, lean ${f.lean_kg <= 0 ? '−' : '+'}${Math.abs(f.lean_kg).toFixed(1)} kg since ${vsPrevious.date}${flags.some((x) => x.code === 'lean_loss') ? ' — lean-loss guard' : ''}`
    : `Scan ${date} recorded`
  const note = eventInsert(ai, {
    kind: 'note',
    summary,
    body: { text: narrative, scan_id: self.id, narrative_by, proposal_ids, milestone_updates: anchors.updates },
    date,
    job_id: input.job_id ?? null,
  })
  await runBatch(deps, [note.statement, ...anchors.statements])

  return {
    output: {
      narrative,
      fat_vs_lean: { fat_kg: f?.fat_kg ?? 0, lean_kg: f?.lean_kg ?? 0, water_kg: f?.water_kg ?? 0 },
      flags,
      milestone_updates: anchors.updates.flatMap((u) => (u.reached_on ? [{ milestone_id: u.milestone_id, kind: u.kind, reached_on: u.reached_on }] : [])),
      proposals: proposed,
    },
    meta,
  }
}

const withRouter = (deps: Deps, limit: number): ScanJobDeps => ({ ...deps, router: createLlmRouter(deps, { budget: { limit, used: 0 } }) })

registerJobHandler('scan_extract', {
  fetches: EXTRACT_FETCHES,
  run: (deps, job) => extractScan(withRouter(deps, EXTRACT_FETCHES), job.payload),
})

registerJobHandler('scan_analysis', {
  fetches: ANALYSIS_FETCHES,
  run: (deps, job) => analyseScan(withRouter(deps, ANALYSIS_FETCHES), { ...job.payload, job_id: job.id }),
})
