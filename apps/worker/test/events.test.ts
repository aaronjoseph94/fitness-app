// Owns: tests at the events seam (GET /api/events?since=) — a full page hands back the last row's time as the next
// `since` so nothing newer is skipped, and the poll overlaps a few seconds so an event stamped just before a poll but
// written after it still arrives (clients merge by id).
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'
import { createDb } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { listEvents, recordEvent } from '../src/modules/events'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
const at = (now: string): Deps => ({ db, env, now: () => new Date(now), actor: 'ai', waitUntil: (p) => void pending.push(p.catch(() => undefined)) })
afterEach(async () => {
  await Promise.all(pending.splice(0))
})
const note = (now: string, text: string) => recordEvent(at(now), { kind: 'note', summary: text, body: { text } })

describe('listEvents since', () => {
  it('a full page of 200 continues from its last event, so the 5 newer ones arrive on the next poll', async () => {
    const ids: string[] = []
    for (let i = 0; i < 205; i++) ids.push(await note(new Date(Date.parse('2026-10-05T14:00:00.000Z') + i * 1000).toISOString(), `n${i}`))

    const first = await listEvents(at('2026-10-05T15:00:00.000Z'), { since: '2026-10-05T13:00:00.000Z' })
    const second = await listEvents(at('2026-10-05T15:00:00.000Z'), { since: first.server_time })

    expect(first.events).toHaveLength(200)
    expect(new Set([...first.events, ...second.events].map((e) => e.id))).toEqual(new Set(ids))
  })

  it('an event stamped 2 s before a poll but written after it arrives on the next poll', async () => {
    const poll = await listEvents(at('2026-10-06T15:00:00.000Z'), { since: '2026-10-06T14:00:00.000Z' })
    const late = await note('2026-10-06T14:59:58.000Z', 'late writer')

    const next = await listEvents(at('2026-10-06T15:00:15.000Z'), { since: poll.server_time })

    expect(next.events.map((e) => e.id)).toContain(late)
  })
})
