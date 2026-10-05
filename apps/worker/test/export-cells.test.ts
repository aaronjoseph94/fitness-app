// Owns: tests at the export seam (importTablePage) for the cell check every restored table gets — a cell that its
// column can't hold (a word in a number column, null in a NOT NULL column, a missing required column, 2 in a 0/1
// column, text that isn't JSON in a JSON column, a value outside a text enum, a number in a text column) refuses the
// whole page with 422 invalid_rows naming the table, the row and the column, and nothing is written; a valid page of
// the same tables still restores.
import type { ExportRow } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { eq, inArray } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createDb, fast_logs, sleep_logs, weight_logs } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { importTablePage } from '../src/modules/export'

const db = createDb(env.DB)
const deps: Deps = { db, env, now: () => new Date('2026-10-05T18:00:00.000Z'), actor: 'user', waitUntil: () => undefined }
const STAMP = '2026-10-05T17:00:00.000Z'

/** One page of `table`, as the browser's restore sends it (overwrite: this instance may already hold rows). */
const restore = (table: 'weight_logs' | 'sleep_logs' | 'fast_logs', rows: ExportRow[]) =>
  importTablePage(deps, { restore_id: crypto.randomUUID(), overwrite: true, table, rows })

/** A weigh-in row exactly as an export page carries it. */
const weighIn = (date: string, weight_kg: ExportRow[string]): ExportRow => ({
  id: crypto.randomUUID(),
  date,
  weight_kg,
  note: null,
  actor: 'user',
  created_at: STAMP,
  updated_at: STAMP,
})

describe('restore refuses cells their column cannot hold, in every table', () => {
  it('refuses a weigh-in of "heavy" by table, row and column, and writes nothing from that page', async () => {
    const good = weighIn('2026-09-01', 93.8)
    const bad = weighIn('2026-09-02', 'heavy')

    const refused = restore('weight_logs', [good, bad])

    await expect(refused).rejects.toMatchObject({ status: 422, code: 'invalid_rows' })
    await expect(refused).rejects.toThrow(/weight_logs row 2 .*weight_kg/)
    expect(await db.select().from(weight_logs).where(inArray(weight_logs.id, [String(good.id), String(bad.id)]))).toEqual([])
  })

  it('refuses null in a NOT NULL column, a missing required column, 2 in a 0/1 column, bad JSON, an unknown enum value and a number in a text column', async () => {
    const { weight_kg: _dropped, ...noWeight } = weighIn('2026-09-03', 92)
    const sleep = {
      id: crypto.randomUUID(),
      date: '2026-09-04',
      in_bed_at: '2026-09-04T05:10:00.000Z',
      woke_at: '2026-09-04T12:40:00.000Z',
      asleep_min: 420,
      source: 'import',
      stages: '{"deep":80}',
      actor: 'user',
      created_at: STAMP,
      updated_at: STAMP,
    } satisfies ExportRow
    const fast = {
      id: crypto.randomUUID(),
      started_at: '2026-09-05T02:00:00.000Z',
      ended_at: null,
      start_date: '2026-09-04',
      end_date: null,
      planned: 0,
      note: null,
      actor: 'user',
      created_at: STAMP,
      updated_at: STAMP,
    } satisfies ExportRow

    const cases: [() => Promise<unknown>, RegExp][] = [
      [() => restore('weight_logs', [{ ...weighIn('2026-09-03', 92), date: null }]), /weight_logs row 1 .*date/],
      [() => restore('weight_logs', [noWeight]), /weight_logs.*weight_kg/],
      [() => restore('weight_logs', [{ ...weighIn('2026-09-03', 92), note: 5 }]), /weight_logs row 1 .*note/],
      [() => restore('fast_logs', [{ ...fast, planned: 2 }]), /fast_logs row 1 .*planned/],
      [() => restore('sleep_logs', [{ ...sleep, stages: 'not json' }]), /sleep_logs row 1 .*stages/],
      [() => restore('sleep_logs', [{ ...sleep, source: 'fitbit' }]), /sleep_logs row 1 .*source/],
    ]
    for (const [run, names] of cases) {
      const refused = run()
      await expect(refused, String(names)).rejects.toMatchObject({ status: 422, code: 'invalid_rows' })
      await expect(refused, String(names)).rejects.toThrow(names)
    }
    expect(await db.select().from(sleep_logs).where(eq(sleep_logs.id, sleep.id))).toEqual([])
    expect(await db.select().from(fast_logs).where(eq(fast_logs.id, fast.id))).toEqual([])

    // The same rows, valid, restore.
    await expect(restore('sleep_logs', [sleep])).resolves.toEqual({ table: 'sleep_logs', upserted: 1 })
    await expect(restore('fast_logs', [fast])).resolves.toEqual({ table: 'fast_logs', upserted: 1 })
    const [storedSleep] = await db.select().from(sleep_logs).where(eq(sleep_logs.id, sleep.id))
    expect(storedSleep).toMatchObject({ source: 'import', stages: { deep: 80 }, asleep_min: 420 })
    const [storedFast] = await db.select().from(fast_logs).where(eq(fast_logs.id, fast.id))
    expect(storedFast?.planned).toBe(false)
  })

  it('still restores a valid weigh-in page', async () => {
    const rows = [weighIn('2026-08-01', 94.2), weighIn('2026-08-02', 94.0)]
    await expect(restore('weight_logs', rows)).resolves.toEqual({ table: 'weight_logs', upserted: 2 })
    const stored = await db
      .select({ date: weight_logs.date, kg: weight_logs.weight_kg })
      .from(weight_logs)
      .where(inArray(weight_logs.id, rows.map((r) => String(r.id))))
      .orderBy(weight_logs.date)
    expect(stored).toEqual([
      { date: '2026-08-01', kg: 94.2 },
      { date: '2026-08-02', kg: 94.0 },
    ])
  })
})
