// Owns: Ask AI's receipts (chat_receipts) — what one message logged, one row per fact (or attached meal photo / scan
// sheet) with the row it wrote and that day's row before it — read back per message in order, deleted with their
// thread, and Undo: once per receipt, through the owning module's own delete or restore (the row goes, or the day's
// earlier value comes back), then a best-effort reforecast. Undo runs as the route's actor (Aaron).
// Undo claims the receipt first (UPDATE … WHERE undone_at IS NULL), so two taps undo once; if the module's write then
// fails, the claim is released and the error goes back to the caller.
import { today } from '@fitness/shared/engine'
import {
  Measurement,
  SleepLog,
  StepLog,
  WeighIn,
  type Receipt,
  type ReceiptKind,
} from '@fitness/shared/schemas'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import * as z from 'zod'
import { chat_receipts, chunk, runBatch, type Row } from '../../../db'
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
  before: unknown
}

/** Kinds whose logs move the trend, intake or fast days the forecast reads. */
const MOVES_FORECAST: ReadonlySet<ReceiptKind> = new Set([
  'weight',
  'meal',
  'water',
  'steps',
  'fast_start',
  'fast_end',
])
export const movesForecast = (kind: ReceiptKind) => MOVES_FORECAST.has(kind)

/** chat_receipts has 11 columns; D1 allows 100 bound parameters per statement. */
const ROWS_PER_INSERT = Math.floor(100 / 11)
const IN_CHUNK = 90

/** Store one message's receipts (in order: created_at steps by 1 ms) in one batch; returns them as Receipts. */
export async function insertReceipts(
  deps: Deps,
  message: { id: string; thread_id: string },
  drafts: readonly ReceiptDraft[],
): Promise<Receipt[]> {
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
      before: d.before ?? null,
      undone_at: null,
      created_at,
      updated_at: created_at,
    }
  })
  await runBatch(
    deps.db,
    chunk(rows, ROWS_PER_INSERT).map((part) => deps.db.insert(chat_receipts).values(part)),
  )
  return rows.map(toReceipt)
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
 * (it is reviewed or deleted in Scans). The row goes, or the day's earlier value comes back; then the forecast is
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
      .where(eq(chat_receipts.id, id))
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

/** The owning module's undo of one receipt's write. */
async function undoWrite(deps: Deps, row: ReceiptRow): Promise<void> {
  const ref = row.ref_id
  switch (row.kind) {
    case 'weight':
      await deleteWeighIn(deps, ref, parsed(WeighIn, row.before))
      return
    case 'measurement':
      await deleteMeasurement(deps, ref, parsed(Measurement, row.before))
      return
    case 'sleep':
      await deleteSleep(deps, ref, parsed(SleepLog, row.before))
      return
    case 'steps':
      await deleteSteps(deps, ref, parsed(StepLog, row.before))
      return
    case 'meal':
      await deleteMeal(deps, ref)
      return
    case 'water':
      await deleteWater(deps, ref)
      return
    case 'fast_start':
      await unstartFast(deps, ref, parsed(PlannedFast, row.before)?.started_at ?? null)
      return
    case 'fast_end':
      await reopenFast(deps, ref)
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
