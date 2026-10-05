// Owns: tests at the scans seam — the 2026-09-26 sheet (SPEC §2 seed record, printed in lb) extracts within rounding
// and round-trips through confirm in kg; a scan losing lean mass trips the lean-loss guard with the engine's debrief
// when no LLM answers; an LLM debrief's proposals go through the guards; a scan dated in the future is refused; the
// scan-due note; a PNG sheet carrying a text chunk (metadata) is refused before it is stored. The fake router stands in for the LLM; the real one (no keys
// locally) shows the graceful failure path.
import { ReminderKind, ScanRecord, type ReminderPrefs, type ScanExtractOutput } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import seed from '../../../seed/scans/2026-09-26.json'
import { ai_events, ai_jobs, createDb, milestones, plan_versions, profile, scan_segments, scans, settings, weight_logs } from '../src/db'
import type { Deps } from '../src/lib/deps'
import type { CompleteRequest } from '../src/modules/llm'
import { analyseScan, confirmScan, extractScan, getScan, noteScanDue, scanSchedule, uploadScan, type ScanJobDeps } from '../src/modules/scans'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
const at = (iso: string): Deps => ({
  db,
  env,
  now: () => new Date(iso),
  actor: 'user',
  waitUntil: (p) => void pending.push(p.catch(() => undefined)),
})
const deps = at('2026-10-05T18:00:00.000Z')
/** Let background jobs (runSoon) finish before asserting. */
const settle = async () => {
  while (pending.length) await Promise.all(pending.splice(0))
}

/** A fake router: `answer` returns the model's JSON (validated with the caller's schema) or an Error to throw. */
function fakeRouter(answer: (req: CompleteRequest<unknown>) => unknown): ScanJobDeps['router'] & { calls: CompleteRequest<unknown>[] } {
  const calls: CompleteRequest<unknown>[] = []
  return {
    calls,
    async complete<T>(req: CompleteRequest<T>) {
      calls.push(req as CompleteRequest<unknown>)
      const out = answer(req as CompleteRequest<unknown>)
      if (out instanceof Error) throw out
      return { data: req.schema.parse(out), provider: 'fake', model: 'fake-1', latency_ms: 1, tokens_in: 1, tokens_out: 1, attempts: 1 }
    },
  }
}

const MASS = [
  'weight_kg',
  'lean_body_mass_kg',
  'skeletal_muscle_mass_kg',
  'protein_kg',
  'mineral_kg',
  'total_body_water_kg',
  'icf_kg',
  'ecf_kg',
  'body_fat_mass_kg',
  'subcutaneous_fat_kg',
  'visceral_fat_kg',
] as const
const SEGMENTS = ['left_arm', 'right_arm', 'torso', 'left_leg', 'right_leg'] as const
/** The sheet prints lb to 0.1. */
const lb = (kg: number) => Math.round((kg / 0.4536) * 10) / 10

/** SPEC §2 baseline as a confirmed record (UTC scanned_at, hydration/matches_baseline defaulted). */
const BASELINE = ScanRecord.parse(seed)
const reminders = Object.fromEntries(ReminderKind.options.map((k) => [k, { enabled: true, time: null }])) as ReminderPrefs

/** A confirmed scan row + its five segments, written directly (no analysis job). */
async function insertConfirmed(record: ScanRecord, date: string): Promise<string> {
  const id = crypto.randomUUID()
  const { segments, ...columns } = record
  await db.batch([
    db.insert(scans).values({ ...columns, id, date, confirmed: true }),
    db.insert(scan_segments).values(SEGMENTS.map((segment) => ({ scan_id: id, segment, ...segments[segment] }))),
  ])
  return id
}

/** 2026-10-24: −3.0 kg, of which fat −1.5 and lean −1.5 (50 % of the loss), water only −0.3 → the lean-loss guard. */
const LEAN_LOSS_SCAN = ScanRecord.parse({
  ...seed,
  scanned_at: '2026-10-24T09:05:00-06:00',
  weight_kg: 92.1,
  lean_body_mass_kg: 58.1,
  total_body_water_kg: 42.6,
  body_fat_mass_kg: 34.0,
  body_fat_pct: 36.9,
  visceral_fat_level: 15,
  segments: { ...seed.segments, torso: { lean_kg: 27.2, fat_kg: 19.8 } },
  conditions: { time_of_day: 'morning', fasted: true, hours_since_training: 40, notes: null },
})

beforeAll(async () => {
  await db.batch([
    db.insert(profile).values({ height_cm: 165.1, sex: 'male', goal_weight_kg: 65, goal_date: '2027-08-04', start_weight_kg: 95.1, start_date: '2026-09-26' }),
    db.insert(settings).values({
      calorie_floor: 1400,
      calorie_ceiling: 1700,
      protein_min_g: 130,
      fat_min_g: 45,
      fibre_target_g: 30,
      water_target_ml: 3000,
      training_days: ['mon', 'tue', 'wed', 'thu'],
      scan_interval_days: 28,
      reminders,
    }),
    db.insert(plan_versions).values({
      version: 1,
      active: true,
      created_by: 'user',
      reason: 'Baseline rails from doctor and dietitian',
      diff: [],
      targets: { defaults: { kcal: 1400, protein_g: 130, carbs_g: 118.75, fat_g: 45, fibre_g: 30, water_ml: 3000, steps: 8000 }, overrides: {} },
    }),
    db.insert(milestones).values([
      { kind: 'body_fat_pct', target_value: 30, label: 'Body fat under 30 %' },
      { kind: 'visceral_level', target_value: 9, label: 'Visceral fat level 9 or lower' },
      { kind: 'weight', target_value: 90, label: '90 kg' },
    ]),
    db.insert(weight_logs).values({ date: '2026-09-26', weight_kg: 95.1 }),
  ])
})

afterEach(settle)

// Storage is shared by the tests in this file: start each one with no scans, jobs, events or reached milestones.
beforeEach(async () => {
  await db.batch([
    db.update(milestones).set({ reached_on: null, scan_id: null }),
    db.delete(ai_events),
    db.delete(ai_jobs),
    db.delete(scan_segments),
    db.delete(scans),
  ])
})

/** A PNG as the browser's canvas writes it: signature, IHDR, the given chunks, IEND (CRCs are not checked). */
function pngSheet(...extra: [type: string, data: string][]): ArrayBuffer {
  const enc = new TextEncoder()
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length)
    new DataView(out.buffer).setUint32(0, data.length)
    out.set(enc.encode(type), 4)
    out.set(data, 8)
    return out
  }
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', new Uint8Array(13)),
    ...extra.map(([type, data]) => chunk(type, enc.encode(data))),
    chunk('IDAT', new Uint8Array(16)),
    chunk('IEND', new Uint8Array(0)),
  ]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  parts.reduce((at, p) => (out.set(p, at), at + p.length), 0)
  return out.buffer
}

describe('scan extraction', () => {
  it('refuses a PNG sheet that still carries a text chunk, and stores nothing', async () => {
    const id = crypto.randomUUID()
    await expect(uploadScan(deps, { query: { id, content_type: 'image/png' }, body: pngSheet(['tEXt', 'Author\0Phone']) })).rejects.toMatchObject({
      status: 422,
      code: 'exif_present',
    })
    expect(await env.FILES.head(`scan-sheets/${id}.png`)).toBeNull()
    expect(await db.select().from(scans).where(eq(scans.id, id))).toEqual([])
  })

  it('reads the 2026-09-26 sheet (lb) into kg within rounding of SPEC §2, and the confirmed values round-trip', async () => {
    const id = crypto.randomUUID()
    const sheet = pngSheet()
    const uploaded = await uploadScan(deps, { query: { id, content_type: 'image/png' }, body: sheet })
    await settle()

    // No LLM keys locally: the real router fails, the job waits for a retry, and the scan says so (manual entry offered).
    expect(await env.FILES.head(`scan-sheets/${id}.png`)).not.toBeNull()
    expect(await getScan(deps, id)).toMatchObject({
      confirmed: false,
      extracted: null,
      sheet_url: expect.stringMatching(/^\/api\/files\/scan-sheets%2F/),
      extraction: { job_id: uploaded.job_id, status: 'queued', attempts: 1, error: expect.stringContaining('No LLM provider') },
    })

    const printed: ScanExtractOutput = {
      ...seed,
      scanned_at: '2026-09-26T10:13:00Z', // the sheet's wall-clock time as printed (Z: no offset applied by the reader)
      sex: 'male',
      units: 'lb',
      ...Object.fromEntries(MASS.map((k) => [k, lb(seed[k])])),
      segments: Object.fromEntries(SEGMENTS.map((s) => [s, { lean_kg: lb(seed.segments[s].lean_kg), fat_kg: lb(seed.segments[s].fat_kg) }])) as ScanExtractOutput['segments'],
      confidence: [
        { field: 'weight_kg', confidence: 0.98 },
        { field: 'segments.torso.fat_kg', confidence: 0.55 },
      ],
    }
    const router = fakeRouter(() => printed)
    await extractScan({ ...deps, router }, { scan_id: id })
    expect(router.calls[0]).toMatchObject({ job: 'scan_extract', images: [{ mime: 'image/png' }] })
    expect(router.calls[0]!.messages[0]!.content).toContain('segments')

    const draft = (await getScan(deps, id)).extracted!
    expect(draft.source_units).toBe('lb')
    for (const k of MASS) expect(Math.abs(draft[k]! - seed[k]), k).toBeLessThanOrEqual(0.05)
    for (const s of SEGMENTS) {
      expect(Math.abs(draft.segments[s].lean_kg! - seed.segments[s].lean_kg), `${s} lean`).toBeLessThanOrEqual(0.05)
      expect(Math.abs(draft.segments[s].fat_kg! - seed.segments[s].fat_kg), `${s} fat`).toBeLessThanOrEqual(0.05)
    }
    expect(draft).toMatchObject({ weight_kg: 95.12, body_fat_pct: 37.3, visceral_fat_area_cm2: 188, visceral_fat_level: 16, bmr_kcal: 1657, tee_kcal: 2551, waist_hip_ratio: 1.02, bio_age: 38, bwi_score: 5.4 })
    expect(draft.confidence).toContainEqual({ field: 'segments.torso.fat_kg', confidence: 0.55 })
    expect(draft.scanned_at).toBe('2026-09-26T16:13:00.000Z') // SPEC §2: 2026-09-26 10:13 in Edmonton (MDT)

    // Aaron confirms the draft as shown (every value editable), with the conditions.
    const record = ScanRecord.parse({
      ...draft,
      source: 'evolt360',
      conditions: { time_of_day: 'morning', fasted: true, hours_since_training: 40, hydration: 'normal', matches_baseline: true, notes: null },
    })
    const confirmed = await confirmScan(deps, id, { record })
    await settle()
    expect(confirmed.confirmed).toBe(true)
    expect((await getScan(deps, id)).record).toEqual(record)
    expect(await db.select().from(scan_segments).where(eq(scan_segments.scan_id, id))).toHaveLength(5)
  })
})

describe('scan extraction time', () => {
  it('reads the printed wall-clock time and places it in Edmonton itself: 2026-11-20 07:15 → 13:15Z (UTC−6 all year from 2026-11-01)', async () => {
    const id = crypto.randomUUID()
    await uploadScan(deps, { query: { id, content_type: 'image/png' }, body: pngSheet() })
    await settle()
    const printed = { ...ScanRecord.parse(seed), scanned_at: '2026-11-20T07:15:00Z', units: 'lb' as const, confidence: [] }
    const router = fakeRouter(() => printed)

    await extractScan({ ...deps, router }, { scan_id: id })

    expect((await getScan(deps, id)).extracted!.scanned_at).toBe('2026-11-20T13:15:00.000Z')
    expect(router.calls[0]!.messages[0]!.content).not.toMatch(/-07:00/)
  })
})

describe('scan confirm', () => {
  it('refuses a scan dated after now (a typo would become the latest scan and push the next scan due date out)', async () => {
    await insertConfirmed(BASELINE, '2026-09-26')
    const id = crypto.randomUUID()

    await expect(confirmScan(deps, id, { record: { ...LEAN_LOSS_SCAN, scanned_at: '2026-11-20T14:00:00.000Z' } })).rejects.toMatchObject({ status: 400 })

    expect(await db.select().from(scans).where(eq(scans.id, id))).toEqual([])
    expect((await scanSchedule(deps)).last_scan_date).toBe('2026-09-26')
  })
})

describe('scan analysis', () => {
  it('flags the lean-loss guard and stores the engine debrief when no LLM answers; the protein proposal passes the guards', async () => {
    await insertConfirmed(BASELINE, '2026-09-26')
    const id = crypto.randomUUID()
    await db.insert(scans).values({ id, scanned_at: '2026-10-24T15:05:00.000Z', date: '2026-10-24', confirmed: false })
    await confirmScan(at('2026-10-24T18:00:00.000Z'), id, { record: LEAN_LOSS_SCAN })
    await settle() // the real handler runs: no LLM keys → the engine's plain debrief

    const { analysis } = await getScan(deps, id)
    expect(analysis!.vs_previous).toMatchObject({ date: '2026-09-26', days: 28, lean_loss: 'lean_loss' })
    expect(analysis!.vs_previous!.lean_share_of_loss).toBeCloseTo(0.5, 6)
    expect(analysis!.vs_previous!.fat_vs_lean.weight_kg).toBeCloseTo(-3.0, 6)
    expect(analysis!.vs_previous!.segments.torso!.fat_kg).toBeCloseTo(-0.7, 6)
    expect(analysis!.flags.map((f) => f.code)).toEqual(['lean_loss'])
    expect(analysis).toMatchObject({ status: 'done', narrative_by: 'engine', narrative: expect.stringContaining('Since 2026-09-26 (28 days)') })
    expect(analysis!.proposal_ids).toHaveLength(1)

    const [proposal] = await db.select().from(ai_events).where(eq(ai_events.id, analysis!.proposal_ids[0]!))
    expect(proposal).toMatchObject({ kind: 'proposal', actor: 'ai', proposal_status: 'pending' })
    expect(proposal!.body).toMatchObject({ kind: 'plan_change', changes: [{ field: 'protein_g', from: 130, to: 140 }] })
  })

  it('takes the narrative and proposals from the LLM, but the guards drop a 1,300 kcal target and `from` is the plan’s', async () => {
    await insertConfirmed(BASELINE, '2026-09-26')
    const id = await insertConfirmed(
      ScanRecord.parse({ ...seed, scanned_at: '2026-10-24T09:05:00-06:00', weight_kg: 91.5, body_fat_mass_kg: 26.9, body_fat_pct: 29.4, lean_body_mass_kg: 64.6 }),
      '2026-10-24',
    )
    const router = fakeRouter(() => ({
      narrative: 'Body fat is under 30 % for the first time.',
      proposals: [
        { field: 'kcal', weekday: null, from: 1400, to: 1300, reason: 'Cut deeper' },
        { field: 'steps', weekday: null, from: 1, to: 9000, reason: 'More walking' },
      ],
    }))
    const { output } = await analyseScan({ ...at('2026-10-24T18:00:00.000Z'), router }, { scan_id: id })

    expect(router.calls[0]!.messages[0]!.content).toContain('"lean_loss_guard":"ok"')
    expect(output.narrative).toBe('Body fat is under 30 % for the first time.')
    expect(output.proposals).toEqual([{ field: 'steps', weekday: null, from: 8000, to: 9000, reason: 'More walking' }])
    const [bodyFat] = await db.select().from(milestones).where(and(eq(milestones.kind, 'body_fat_pct'), eq(milestones.target_value, 30)))
    expect(bodyFat).toMatchObject({ reached_on: '2026-10-24', scan_id: id })
    expect((await getScan(deps, id)).analysis).toMatchObject({ narrative_by: 'ai', milestone_updates: [{ label: 'Body fat under 30 %', reached_on: '2026-10-24' }] })
  })
})

describe('scan due', () => {
  it('notes a due scan once on the due date (last scan + 28 days), not before and not twice', async () => {
    await insertConfirmed(BASELINE, '2026-09-26')
    expect(await noteScanDue(at('2026-10-23T14:00:00.000Z'), '2026-10-23')).toEqual({ due: '2026-10-24', noted: false })
    expect(await noteScanDue(at('2026-10-24T14:00:00.000Z'), '2026-10-24')).toEqual({ due: '2026-10-24', noted: true })
    expect(await noteScanDue(at('2026-10-25T14:00:00.000Z'), '2026-10-25')).toEqual({ due: '2026-10-24', noted: false })
    const notes = await db.select().from(ai_events).where(eq(ai_events.kind, 'note'))
    expect(notes.map((n) => n.summary)).toEqual([expect.stringContaining('Evolt scan due today (last 2026-09-26, every 28 days)')])
  })
})
