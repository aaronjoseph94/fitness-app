// Owns: tests at the fasting seam — a fast makes one fast day (none for a mis-tap, which can then be deleted), a
// planned fast nobody ended stops blocking a new fast and can be removed as skipped, and ending or cancelling a fast
// that touched today writes a fresh day card. Today is Monday 2026-10-05.
import { ReminderKind, type ReminderPrefs } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ai_events, createDb, daily_targets, fast_logs, plan_versions, profile, settings } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { adjustDayForFast, cancelFast, endFast, listFasts, planFast, startFast } from '../src/modules/fasting'
import '../src/modules/meal-ai' // registers the day_adjustment handler (no LLM keys: the card is written in plain text)

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
/** Monday 2026-10-05 09:00 MDT. */
const NOW = '2026-10-05T15:00:00.000Z'
const at = (now = NOW): Deps => ({ db, env, now: () => new Date(now), actor: 'user', waitUntil: (p) => void pending.push(p.catch(() => undefined)) })
afterEach(async () => {
  await Promise.all(pending.splice(0))
})

const reminders = Object.fromEntries(ReminderKind.options.map((k) => [k, { enabled: true, time: null }])) as ReminderPrefs
const todayTargets = async () => (await db.select().from(daily_targets).where(eq(daily_targets.date, '2026-10-05')))[0]

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
      reminders,
    }),
    db.insert(plan_versions).values({
      version: 1,
      active: true,
      created_by: 'user',
      reason: 'Baseline rails from doctor and dietitian',
      diff: [],
      targets: { defaults: { kcal: 1400, protein_g: 130, carbs_g: 119, fat_g: 45, fibre_g: 30, water_ml: 3000, steps: 8000 }, overrides: {} },
    }),
  ])
})

describe('fasts', () => {
  it('a fast ended 5 s after it started makes no fast day, and can be deleted as a mis-tap', async () => {
    const id = crypto.randomUUID()
    // Running from 09:00: 15 of its 24 h fall today, so today is the fast day while it runs.
    await startFast(at(), { id, started_at: NOW })
    expect(await todayTargets()).toMatchObject({ is_fast_day: true, kcal: 0 })

    await endFast(at('2026-10-05T15:00:05.000Z'), id, { ended_at: '2026-10-05T15:00:05.000Z' })
    expect(await todayTargets()).toMatchObject({ is_fast_day: false, kcal: 1400 })

    await cancelFast(at('2026-10-05T15:01:00.000Z'), id)
    expect((await listFasts(at(), {})).map((f) => f.id)).not.toContain(id)
  })

  it('a planned fast nobody ended stops blocking a new fast after 2 × 24 h, and can be removed as skipped', async () => {
    const skipped = crypto.randomUUID()
    // Planned for Thursday 2026-10-01 19:00 MDT; never ended.
    await db.insert(fast_logs).values({ id: skipped, started_at: '2026-10-02T01:00:00.000Z', start_date: '2026-10-01', planned: true })

    const now = crypto.randomUUID()
    await expect(startFast(at(), { id: now, started_at: NOW })).resolves.toMatchObject({ id: now, ended_at: null })

    await cancelFast(at(), skipped)
    expect((await listFasts(at(), {})).map((f) => f.id)).toEqual([now])
  })
})

describe('the day card follows the fast', () => {
  /** The newest day adjustment card for a date. */
  const latestCard = async (date: string) => {
    const cards = (await db.select().from(ai_events).where(eq(ai_events.kind, 'adjustment')))
      .filter((e) => (e.body as { date: string }).date === date)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    return cards.at(-1)?.body as { note: string; remaining: { kcal: number } } | undefined
  }
  const settle = () => Promise.all(pending.splice(0))

  it('cancelling a planned fast that began on its own ("Didn\'t fast") replaces its "Fast day" card with a fresh one', async () => {
    // Planned for Thursday 2026-10-08 09:00 MDT, past any fast an earlier test left running (2 × 24 h).
    const T = '2026-10-08T15:00:00.000Z'
    const id = crypto.randomUUID()
    await planFast(at('2026-10-08T14:00:00.000Z'), { id, started_at: T })
    // It begins by itself at 09:00 (15 of its 24 h fall on 10-08: today is the fast day); the cron writes its card.
    await adjustDayForFast(at('2026-10-08T15:05:00.000Z'), { id, started_at: T, start_date: '2026-10-08' })
    await settle()
    expect((await latestCard('2026-10-08'))?.note).toMatch(/^Fast day/)

    await cancelFast(at('2026-10-08T17:00:00.000Z'), id)
    await settle()
    // The day is a 1,400 kcal training day again, nothing eaten.
    expect(await latestCard('2026-10-08')).toMatchObject({ note: '1400 kcal and 130 g protein left today.', remaining: { kcal: 1400 } })
  })

  it('ending a fast as a mis-tap replaces its "Fast day" card with a fresh one', async () => {
    const T = '2026-10-09T15:00:00.000Z' // Friday 09:00 MDT
    const id = crypto.randomUUID()
    await startFast(at(T), { id, started_at: T })
    await settle()
    expect((await latestCard('2026-10-09'))?.note).toMatch(/^Fast day/)

    await endFast(at('2026-10-09T15:00:30.000Z'), id, { ended_at: '2026-10-09T15:00:30.000Z' }) // no fast day now
    await settle()
    expect(await latestCard('2026-10-09')).toMatchObject({ note: '1400 kcal and 130 g protein left today.', remaining: { kcal: 1400 } })
  })
})
