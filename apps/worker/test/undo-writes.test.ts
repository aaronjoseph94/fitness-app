// Owns: tests at the body and health seams for an undo (Ask AI's receipt Undo) — it removes the row only while the row
// still holds what the undone write stored: an untouched weigh-in goes and the earlier one comes back with its own
// actor; one edited since, or a night the Shortcut has re-sent since, is left alone ('superseded'). Dates in 2002 keep
// these rows apart from other tests'.
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createDb, sleep_logs, weight_logs } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { deleteWeighIn, logWeighIn, updateWeighIn, weighInOn } from '../src/modules/body'
import { deleteSleep, ingestHealth, logSleep } from '../src/modules/health'

const db = createDb(env.DB)
const at = (iso: string, actor: Deps['actor'] = 'ai'): Deps => ({
  db,
  env,
  now: () => new Date(iso),
  actor,
  waitUntil: () => undefined,
})

describe('undo of a logged fact', () => {
  it("removes an untouched weigh-in and puts the earlier one back as Aaron's", async () => {
    await logWeighIn(at('2002-05-01T15:00:00.000Z', 'user'), {
      id: crypto.randomUUID(),
      date: '2002-05-01',
      weight_kg: 95.4,
    })
    const before = await weighInOn(at('2002-05-01T16:00:00.000Z'), '2002-05-01')
    const dumped = await logWeighIn(at('2002-05-01T16:00:00.000Z'), {
      id: crypto.randomUUID(),
      date: '2002-05-01',
      weight_kg: 94.9,
    })

    const out = await deleteWeighIn(at('2002-05-01T17:00:00.000Z'), dumped.id, {
      updated_at: dumped.updated_at,
      restore: before,
    })

    expect(out).toBe('undone')
    const [row] = await db.select().from(weight_logs).where(eq(weight_logs.date, '2002-05-01'))
    expect(row).toMatchObject({ id: before!.id, weight_kg: 95.4, actor: 'user' })
  })

  it('leaves a weigh-in edited since alone', async () => {
    const dumped = await logWeighIn(at('2002-05-02T16:00:00.000Z'), {
      id: crypto.randomUUID(),
      date: '2002-05-02',
      weight_kg: 94.9,
    })
    await updateWeighIn(at('2002-05-02T16:30:00.000Z', 'user'), dumped.id, {
      date: '2002-05-02',
      weight_kg: 94.6,
      note: null,
    })

    const out = await deleteWeighIn(at('2002-05-02T17:00:00.000Z'), dumped.id, { updated_at: dumped.updated_at })

    expect(out).toBe('superseded')
    const [row] = await db.select().from(weight_logs).where(eq(weight_logs.id, dumped.id))
    expect(row?.weight_kg).toBe(94.6)
  })

  it('leaves a night the Shortcut has re-sent since alone (the upsert keeps the id, moves updated_at)', async () => {
    const dumped = await logSleep(at('2002-05-03T16:00:00.000Z'), {
      id: crypto.randomUUID(),
      date: '2002-05-03',
      asleep_min: 400,
    })
    await ingestHealth(at('2002-05-03T16:30:00.000Z', 'user'), {
      date: '2002-05-03',
      steps: 9000,
      sleep: {
        in_bed_at: '2002-05-03T05:00:00.000Z',
        woke_at: '2002-05-03T12:30:00.000Z',
        asleep_min: 420,
      },
    })

    const out = await deleteSleep(at('2002-05-03T17:00:00.000Z'), dumped.id, { updated_at: dumped.updated_at })

    expect(out).toBe('superseded')
    const [row] = await db.select().from(sleep_logs).where(eq(sleep_logs.id, dumped.id))
    expect(row?.asleep_min).toBe(420)
  })
})
