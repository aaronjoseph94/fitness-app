// Owns: tests at the push and reminders seams (modules/push and modules/reminders index) with a fake push adapter:
// the weigh-in reminder goes out at 07:00 Edmonton once per day and nothing at 06:55; the water reminder only when
// behind pace (target × elapsed share of 07:00–22:00); a subscription the push service reports gone (410) is
// dropped; with no VAPID keys and no adapter nothing is sent.
import { DEFAULT_REMINDER_PREFS, type PushNotification } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createDb, profile, push_subscriptions, settings, water_logs } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { sendPush, sendTest, subscribe, type PushDeps, type PushSender } from '../src/modules/push'
import { dispatchReminders } from '../src/modules/reminders'

const db = createDb(env.DB)
const ENDPOINT = 'https://push.example.test/sub/phone'
const KEYS = { p256dh: 'BPhone-p256dh', auth: 'phone-auth' }

let delivered: { endpoint: string; notification: PushNotification }[] = []
let status = 201
const fakeSender: PushSender = async (target, notification) => {
  delivered.push({ endpoint: target.endpoint, notification })
  return status
}

/** Deps at an instant; October is MDT (UTC−6), so 07:00 Edmonton is 13:00Z. */
const at = (iso: string, pushSender: PushSender | null = fakeSender): PushDeps => ({
  db,
  env,
  now: () => new Date(iso),
  actor: 'ai',
  waitUntil: () => undefined,
  ...(pushSender ? { pushSender } : {}),
})

const kinds = (run: Awaited<ReturnType<typeof dispatchReminders>>) => run.sent.map((s) => s.kind)

beforeAll(async () => {
  await db.batch([
    db.insert(profile).values({ height_cm: 165.1, sex: 'male', goal_weight_kg: 65, goal_date: '2027-08-04', start_weight_kg: 95.1, start_date: '2026-09-26' }),
    db.insert(settings).values({
      protein_min_g: 130,
      fat_min_g: 45,
      fibre_target_g: 30,
      water_target_ml: 3000,
      training_days: ['mon', 'tue', 'wed', 'thu'],
      reminders: DEFAULT_REMINDER_PREFS,
    }),
  ])
})

beforeEach(async () => {
  delivered = []
  status = 201
  await subscribe(at('2026-10-06T12:00:00.000Z') as Deps, {
    endpoint: ENDPOINT,
    keys: KEYS,
    kinds: ['weigh_in', 'water', 'workout', 'fast', 'scan_due', 'review_ready'],
  })
})

describe('reminders dispatcher', () => {
  it('sends the weigh-in at 07:00 Edmonton once per day and nothing at 06:55', async () => {
    expect((await dispatchReminders(at('2026-10-06T12:55:00.000Z'))).sent).toEqual([]) // Tue 06:55
    expect(kinds(await dispatchReminders(at('2026-10-06T13:00:00.000Z')))).toEqual(['weigh_in']) // 07:00
    expect((await dispatchReminders(at('2026-10-06T13:05:00.000Z'))).sent).toEqual([]) // 07:05: already sent today
    expect(kinds(await dispatchReminders(at('2026-10-07T13:00:00.000Z')))).toEqual(['weigh_in']) // Wed 07:00
    expect(delivered).toHaveLength(2)
    expect(delivered[0]).toMatchObject({ endpoint: ENDPOINT, notification: { title: 'Weigh-in', url: '/', tag: 'weigh_in' } })
  })

  it('sends the water reminder only when behind pace', async () => {
    // Thu 13:00: 6 of 15 waking hours gone → expected 3,000 × 0.4 = 1,200 ml. 500 ml logged is 700 ml behind.
    await db.insert(water_logs).values({ date: '2026-10-08', logged_at: '2026-10-08T15:00:00.000Z', amount_ml: 500 })
    const behind = await dispatchReminders(at('2026-10-08T19:00:00.000Z'))
    expect(behind.sent).toMatchObject([{ kind: 'water', period_key: '2026-10-08T13:00', result: { sent: 1 } }])
    expect(delivered[0]?.notification.body).toBe('0.5 L of 3.0 L so far, about 0.7 L behind pace. Have a glass now.')

    // Fri 13:00 with 1,500 ml logged: ahead of the 1,200 ml pace → nothing.
    await db.insert(water_logs).values({ date: '2026-10-09', logged_at: '2026-10-09T16:00:00.000Z', amount_ml: 1500 })
    expect((await dispatchReminders(at('2026-10-09T19:00:00.000Z'))).sent).toEqual([])
    // Fri 12:00 is not a 2-hourly slot (09, 11, 13 …) → nothing either.
    expect((await dispatchReminders(at('2026-10-09T18:00:00.000Z'))).sent).toEqual([])
  })

  it('stays quiet when the kind is off', async () => {
    await db.update(settings).set({ reminders: { ...DEFAULT_REMINDER_PREFS, weigh_in: { enabled: false, time: '07:00' } } })
    expect((await dispatchReminders(at('2026-10-10T13:00:00.000Z'))).sent).toEqual([])
    await db.update(settings).set({ reminders: DEFAULT_REMINDER_PREFS })
  })
})

describe('push', () => {
  it('drops a subscription the push service reports gone (410)', async () => {
    status = 410
    expect(await sendTest(at('2026-10-06T18:00:00.000Z'))).toEqual({ configured: true, sent: 0, failed: 0, removed: 1 })
    expect(await db.select().from(push_subscriptions).where(eq(push_subscriptions.endpoint, ENDPOINT))).toEqual([])
  })

  it('sends nothing without VAPID keys or an adapter', async () => {
    const notification = { title: 'Weigh-in', body: '', url: '/', tag: 'weigh_in' }
    expect(await sendPush(at('2026-10-06T13:00:00.000Z', null), 'weigh_in', notification)).toEqual({
      configured: false,
      sent: 0,
      failed: 0,
      removed: 0,
    })
    expect(delivered).toEqual([])
  })
})
