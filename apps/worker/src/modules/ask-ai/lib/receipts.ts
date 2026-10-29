// Owns: Ask AI's receipts (chat_receipts) — what one message logged, one row per fact (or attached meal photo / scan
// sheet) with the row it wrote, that row's updated_at and that day's row before it — written in the turn's own batch,
// read back per message in order, deleted with their thread, and Undo: once per receipt, through the owning module's
// own delete or restore (the row goes, or the day's earlier value comes back), then a best-effort reforecast. Undo runs
// as the route's actor (Aaron).
// Undo claims the receipt first (UPDATE … WHERE undone_at IS NULL), so two taps undo once; if the module's write then
// fails or finds the row changed since (409 superseded: the day was logged or edited again), the claim is released
// (only this claim: WHERE undone_at = the claim's instant) and the error goes back to the caller.
// A `before` that is itself the row of a receipt already undone is not put back (undoing two dumps of one day in either
// order never resurrects a value Aaron took back).
import { today } from '@fitness/shared/engine'
import {
  Actor,
  Measurement,
  SleepLog,
  StepLog,
  WeighIn,
  type Receipt,
  type ReceiptKind,
} from '@fitness/shared/schemas'
import { and, asc, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm'
import * as z from 'zod'
import { chat_receipts, chunk, type Row } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { HttpError, notFound } from '../../../lib/http-error'
import { deleteMeasurement, deleteWeighIn } from '../../body'
import { deleteBodyNote, restoreBodyNote } from '../../body-notes'
import { reopenFast, unstartFast } from '../../fasting'
import { deleteSleep, deleteSteps } from '../../health'
import { deleteMeal } from '../../nutrition'
import { reforecast } from '../../plan'
import { deleteWater } from '../../water'

type ReceiptRow = Row<typeof chat_receipts>

/** A receipt before it is stored: what was written, and that day's row before it (null: none). */
export interface ReceiptDraft {
  kind: ReceiptKind
  date: string
  summary: string
  ref_id: string
  /** The written row's updated_at (weight, measurement, sleep, steps): Undo deletes only while it still matches. */
  ref_updated_at: string | null
  before: unknown
}

/**
 * Kinds whose logs (or undos) move the trend, intake or fast days the forecast reads. A dump's text meal is still
 * 'parsing' (no intake yet), so the turn does not reforecast for meals alone; undoing a meal does.
 */
const MOVES_FORECAST: ReadonlySet<ReceiptKind> = new Set([
  'weight',
  'meal',
  'water',
  'steps',
  'fast_start',
  'fast_end',
])
export const movesForecast = (kind: ReceiptKind) => MOVES_FORECAST.has(kind)

/** chat_receipts has 12 columns; D1 allows 100 bound parameters per statement. */
const ROWS_PER_INSERT = Math.floor(100 / 12)
const IN_CHUNK = 90

/** The statements storing one message's receipts (in order: created_at steps by 1 ms), for the caller's batch. */
export function receiptInserts(
  deps: Deps,
  message: { id: string; thread_id: string },
  drafts: readonly ReceiptDraft[],
) {
  const at = deps.now().getTime()
  const rows: ReceiptRow[] = drafts.map((d, i) => {
    const created_at = new Date(at + i).toISOString()
    return {
      id: crypto.randomUUID(),
      message_id: message.id,
      thread_id: message.thread_id,
      kind: d.kind,
      date: d.date,
      summary: d.summary,
      ref_id: d.ref_id,
      ref_updated_at: d.ref_updated_at,
      before: d.before ?? null,
      undone_at: null,
      created_at,
      updated_at: created_at,
    }
  })
  return chunk(rows, ROWS_PER_INSERT).map((part) => deps.db.insert(chat_receipts).values(part))
}

/** The receipts of these messages, each message's in the order logged. */
export async function receiptsOf(deps: Deps, messageIds: readonly string[]): Promise<Map<string, Receipt[]>> {
  const out = new Map<string, Receipt[]>()
  const ids = [...new Set(messageIds)]
  if (ids.length === 0) return out
  const parts = await Promise.all(
    chunk(ids, IN_CHUNK).map((part) =>
      deps.db
        .select()
        .from(chat_receipts)
        .where(inArray(chat_receipts.message_id, part))
        .orderBy(asc(chat_receipts.created_at)),
    ),
  )
  for (const row of parts.flat()) {
    const list = out.get(row.message_id) ?? []
    list.push(toReceipt(row))
    out.set(row.message_id, list)
  }
  return out
}

/** The statement deleting a thread's receipts, for the thread delete's batch. */
export function deleteThreadReceipts(deps: Deps, thread_id: string) {
  return deps.db.delete(chat_receipts).where(eq(chat_receipts.thread_id, thread_id))
}

/**
 * POST /api/ai/receipts/:id/undo. 404 unknown; 409 already_undone the second time; 409 not_undoable for a scan sheet
 * (it is reviewed or deleted in Scans); 409 superseded when the row was logged or edited again since (it stays as it
 * is, and the receipt stays not undone). The row goes, or the day's earlier value comes back; then the forecast is
 * recomputed when the kind moves it (best effort: the undo stands if that fails).
 */
export async function undoReceipt(deps: Deps, id: string): Promise<Receipt> {
  const [row] = await deps.db.select().from(chat_receipts).where(eq(chat_receipts.id, id))
  if (!row) throw notFound('Receipt')
  if (row.kind === 'scan')
    throw new HttpError(409, 'not_undoable', 'A scan sheet is reviewed or deleted in Scans')
  const now = deps.now().toISOString()
  const claimed = await deps.db
    .update(chat_receipts)
    .set({ undone_at: now, updated_at: now })
    .where(and(eq(chat_receipts.id, id), isNull(chat_receipts.undone_at)))
    .returning({ id: chat_receipts.id })
  if (claimed.length === 0) throw new HttpError(409, 'already_undone', 'This was already undone')
  try {
    await undoWrite(deps, row)
  } catch (e) {
    await deps.db
      .update(chat_receipts)
      .set({ undone_at: null, updated_at: now })
      .where(and(eq(chat_receipts.id, id), eq(chat_receipts.undone_at, now)))
    throw e
  }
  if (movesForecast(row.kind)) {
    try {
      await reforecast(deps, { as_of: today(deps.now()), reestimate: false })
    } catch (e) {
      console.warn(
        JSON.stringify({
          at: 'ask_ai',
          event: 'undo_reforecast_failed',
          error: e instanceof Error ? e.name : 'unknown',
        }),
      )
    }
  }
  return toReceipt({ ...row, undone_at: now, updated_at: now })
}

/** `before` as stored, parsed with its contract (null when absent or unreadable: the row is then just deleted). */
const parsed = <T>(schema: z.ZodType<T>, before: unknown): T | null =>
  before == null ? null : (schema.safeParse(before).data ?? null)

const BodyNoteBefore = z.object({ date: z.string(), severity: z.number(), note: z.string() })
const PlannedFast = z.object({ started_at: z.string() })
/** A day's earlier row with the actor that wrote it (receipts stored before the actor was kept read as Aaron's). */
const actor = { actor: Actor.default('user') }
const WeighInBefore = WeighIn.extend(actor)
const MeasurementBefore = Measurement.extend(actor)
const SleepBefore = SleepLog.extend(actor)
const StepsBefore = StepLog.extend(actor)

const superseded = () => new HttpError(409, 'superseded', 'Logged again since — edit it in Log')

/** `before`, unless it is the row of a receipt already undone (that value was taken back: it stays gone). */
async function restorable<T extends { id: string }>(
  deps: Deps,
  receiptId: string,
  before: T | null,
): Promise<T | null> {
  if (!before) return null
  const [undone] = await deps.db
    .select({ id: chat_receipts.id })
    .from(chat_receipts)
    .where(
      and(
        eq(chat_receipts.ref_id, before.id),
        isNotNull(chat_receipts.undone_at),
        ne(chat_receipts.id, receiptId),
      ),
    )
    .limit(1)
  return undone ? null : before
}

/** A module's 409 `code` rethrown with words for the Undo button (any other error as it was). */
const explain = (code: string, message: string) => (e: unknown) => {
  if (e instanceof HttpError && e.code === code) throw new HttpError(409, code, message)
  throw e
}

/** The owning module's undo of one receipt's write. */
async function undoWrite(deps: Deps, row: ReceiptRow): Promise<void> {
  const ref = row.ref_id
  // An upserted day: delete only while the row holds this write (ref_updated_at); 'superseded' leaves it alone.
  const upsert = async <T extends { id: string }>(
    del: (
      deps: Deps,
      id: string,
      opts: { updated_at: string; restore?: T | null },
    ) => Promise<'undone' | 'superseded'>,
    schema: z.ZodType<T>,
  ) => {
    if (!row.ref_updated_at) throw superseded()
    const restore = await restorable(deps, row.id, parsed(schema, row.before))
    if ((await del(deps, ref, { updated_at: row.ref_updated_at, restore })) === 'superseded')
      throw superseded()
  }
  switch (row.kind) {
    case 'weight':
      return upsert(deleteWeighIn, WeighInBefore)
    case 'measurement':
      return upsert(deleteMeasurement, MeasurementBefore)
    case 'sleep':
      return upsert(deleteSleep, SleepBefore)
    case 'steps':
      return upsert(deleteSteps, StepsBefore)
    case 'meal':
      await deleteMeal(deps, ref)
      return
    case 'water':
      await deleteWater(deps, ref)
      return
    case 'fast_start':
      await unstartFast(deps, ref, parsed(PlannedFast, row.before)?.started_at ?? null).catch(
        explain('planned_start_passed', 'Its planned start has passed — end or edit the fast in Log'),
      )
      return
    case 'fast_end':
      await reopenFast(deps, ref).catch(
        explain('fast_active', 'Another fast is running now — end it first, or edit this one in Log'),
      )
      return
    case 'body_note': {
      // A renewed note goes back to what it said before; a new note goes.
      const before = parsed(BodyNoteBefore, row.before)
      if (before) await restoreBodyNote(deps, ref, before)
      else await deleteBodyNote(deps, ref)
      return
    }
    case 'scan':
      throw new HttpError(409, 'not_undoable', 'A scan sheet is reviewed or deleted in Scans')
  }
}

/** A row as the contract shape (`before` is JSON this module wrote: a module's own contract row or null). */
function toReceipt(row: ReceiptRow): Receipt {
  return {
    id: row.id,
    message_id: row.message_id,
    kind: row.kind,
    date: row.date,
    summary: row.summary,
    ref_id: row.ref_id,
    before: (row.before ?? null) as Receipt['before'],
    undone_at: row.undone_at,
    created_at: row.created_at,
  }
}
