// Owns: tests at the reminders and push seams (dispatchReminders, sendPush) for timing and delivery — clock reminders
// fire at Edmonton wall-clock time across the clock changes, at most once per local period even when ticks overlap,
// a send that reached no device is retried only inside the 30-minute grace window, a gone (410) subscription is
// dropped, disabled kinds and quiet hours (22:00–07:00) send nothing, fast start/end follow the fast's real 24 h, a fast
// day's water checks run every 90 min, and the real Web Push adapter posts only to known push services.
// Edmonton offsets (IANA tzdb): MDT −06:00 until Sun 2025-11-02 02:00, MST −07:00 until Sun 2026-03-08 02:00, then
// −06:00 all year (tzdb 2026c: Alberta's permanent UTC−6, so no fall back on 2026-11-01).
import { DEFAULT_REMINDER_PREFS, type PushNotification } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDb, daily_targets, fast_logs, plan_versions, profile, push_subscriptions, settings, weight_logs, type Db } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { sendPush, subscribe, type PushDeps, type PushSender } from '../src/modules/push'
import { dispatchReminders } from '../src/modules/reminders'

const db = createDb(env.DB)
const ENDPOINT = 'https://web.push.apple.com/QGuQyavXutnMH5c'
const KEYS = { p256dh: 'BPhone-p256dh', auth: 'phone-auth' }
const PLAN = crypto.randomUUID()

let delivered: { endpoint: string; notification: PushNotification }[] = []
/** What the fake push service answers next: an HTTP status, or 'network' to reject (timeout, DNS…). */
let answer: number | 'network' = 201
const fakeSender: PushSender = async (target, notification) => {
  if (answer === 'network') throw new Error('network down')
  delivered.push({ endpoint: target.endpoint, notification })
  return answer
}

const at = (iso: string, over: Partial<PushDeps> = {}): PushDeps => ({
  db,
  env,
  now: () => new Date(iso),
  actor: 'ai',
  waitUntil: () => undefined,
  pushSender: fakeSender,
  ...over,
})
const kinds = (run: Awaited<ReturnType<typeof dispatchReminders>>) => run.sent.map((s) => s.kind)

/** `db`, except that the next read from `table` throws (once), as a dropped D1 connection does. */
function dbFailingNextRead(table: unknown): Db {
  let armed = true
  const bound = <T extends object>(target: T, prop: string | symbol) => {
    const value: unknown = Reflect.get(target, prop, target)
    return typeof value === 'function' ? value.bind(target) : value
  }
  return new Proxy(db, {
    get(target, prop) {
      if (prop !== 'select') return bound(target, prop)
      return (...args: Parameters<Db['select']>) => {
        const builder = target.select(...args)
        return new Proxy(builder, {
          get(b, p) {
            if (p !== 'from') return bound(b, p)
            return (t: Parameters<typeof builder.from>[0]) => {
              if (armed && t === table) {
                armed = false
                throw new Error('D1_ERROR: Network connection lost.')
              }
              return b.from(t)
            }
          },
        })
      }
    },
  })
}

beforeAll(async () => {
  await db.batch([
    db.insert(profile).values({ height_cm: 165.1, sex: 'male', goal_weight_kg: 65, goal_date: '2027-08-04', start_weight_kg: 95.1, start_date: '2025-10-01' }),
    db.insert(settings).values({
      protein_min_g: 130,
      fat_min_g: 45,
      fibre_target_g: 30,
      water_target_ml: 3000,
      fast_hours: 24,
      training_days: ['mon', 'tue', 'wed', 'thu'],
      reminders: DEFAULT_REMINDER_PREFS,
    }),
    db.insert(plan_versions).values({
      id: PLAN,
      version: 1,
      active: true,
      created_by: 'user',
      reason: 'Baseline rails from doctor and dietitian',
      diff: [],
      targets: { defaults: { kcal: 1400, protein_g: 130, carbs_g: 119, fat_g: 45, fibre_g: 30, water_ml: 3000, steps: 8000 }, overrides: {} },
    }),
  ])
})

beforeEach(async () => {
  delivered = []
  answer = 201
  await db.delete(push_subscriptions)
  await subscribe(at('2025-10-01T12:00:00.000Z') as Deps, {
    endpoint: ENDPOINT,
    keys: KEYS,
    kinds: ['weigh_in', 'water', 'workout', 'fast', 'scan_due', 'review_ready'],
  })
})
afterEach(async () => {
  vi.restoreAllMocks()
  await db.update(settings).set({ reminders: DEFAULT_REMINDER_PREFS })
})

describe('clock reminders on Edmonton time', () => {
  it('weigh-in at 07:00 MST on the fall-back day (14:00Z), not at 13:00Z', async () => {
    expect((await dispatchReminders(at('2025-11-02T13:00:00.000Z'))).sent).toEqual([]) // Sun 06:00 MST
    expect(kinds(await dispatchReminders(at('2025-11-02T14:00:00.000Z')))).toEqual(['weigh_in'])
  })

  it('weigh-in at 07:00 MST on the first full winter day (Mon 2025-11-03 14:00Z), not at 06:55', async () => {
    expect((await dispatchReminders(at('2025-11-03T13:55:00.000Z'))).sent).toEqual([])
    expect(kinds(await dispatchReminders(at('2025-11-03T14:00:00.000Z')))).toEqual(['weigh_in'])
  })

  it('weigh-in at 07:00 MDT on the spring-forward day (Sun 2026-03-08 13:00Z)', async () => {
    expect((await dispatchReminders(at('2026-03-08T12:55:00.000Z'))).sent).toEqual([])
    expect(kinds(await dispatchReminders(at('2026-03-08T13:00:00.000Z')))).toEqual(['weigh_in'])
  })

  it('weigh-in at 07:00 = 13:00Z on Mon 2026-11-02 (no fall back under tzdb 2026c), not again at 14:00Z', async () => {
    expect(kinds(await dispatchReminders(at('2026-11-02T13:00:00.000Z')))).toEqual(['weigh_in'])
    expect((await dispatchReminders(at('2026-11-02T14:00:00.000Z'))).sent).toEqual([])
  })
})

describe('once per period', () => {
  it('two overlapping ticks send the weigh-in once', async () => {
    const runs = await Promise.all([dispatchReminders(at('2025-11-04T14:00:00.000Z')), dispatchReminders(at('2025-11-04T14:00:00.000Z'))])

    expect(runs.flatMap(kinds)).toEqual(['weigh_in'])
    expect(delivered).toHaveLength(1)
  })

  it('a send the push service refused (500) is retried on the next tick', async () => {
    answer = 500
    expect((await dispatchReminders(at('2025-11-05T14:00:00.000Z'))).sent).toMatchObject([{ kind: 'weigh_in', result: { sent: 0, failed: 1 } }])
    answer = 201
    expect((await dispatchReminders(at('2025-11-05T14:05:00.000Z'))).sent).toMatchObject([{ kind: 'weigh_in', result: { sent: 1 } }])
    expect((await dispatchReminders(at('2025-11-05T14:10:00.000Z'))).sent).toEqual([])
  })

  it('a weigh-in whose check failed to read (D1 error after the claim) is retried on the next tick', async () => {
    // Wed 2025-11-12 07:00 MST: the claim lands, then reading today's weigh-in throws.
    expect((await dispatchReminders(at('2025-11-12T14:00:00.000Z', { db: dbFailingNextRead(weight_logs) }))).sent).toEqual([])
    expect(kinds(await dispatchReminders(at('2025-11-12T14:05:00.000Z')))).toEqual(['weigh_in'])
  })

  it('a send that failed on the network is retried on the next tick', async () => {
    answer = 'network'
    expect((await dispatchReminders(at('2025-11-06T14:00:00.000Z'))).sent).toMatchObject([{ kind: 'weigh_in', result: { sent: 0, failed: 1 } }])
    answer = 201
    expect((await dispatchReminders(at('2025-11-06T14:05:00.000Z'))).sent).toMatchObject([{ kind: 'weigh_in', result: { sent: 1 } }])
  })

  it('retries stop at the end of the 30-minute grace (07:30)', async () => {
    answer = 500
    expect(kinds(await dispatchReminders(at('2025-11-07T14:25:00.000Z')))).toEqual(['weigh_in']) // 07:25, refused
    answer = 201
    expect((await dispatchReminders(at('2025-11-07T14:30:00.000Z'))).sent).toEqual([])
    expect(delivered).toHaveLength(1)
  })

  it('a subscription the push service reports gone (410) is dropped and the period stays claimed', async () => {
    answer = 410
    expect((await dispatchReminders(at('2025-11-10T14:00:00.000Z'))).sent).toMatchObject([{ kind: 'weigh_in', result: { sent: 0, failed: 0, removed: 1 } }])
    expect(await db.select().from(push_subscriptions)).toEqual([])

    answer = 201
    await subscribe(at('2025-11-10T14:02:00.000Z') as Deps, { endpoint: ENDPOINT, keys: KEYS, kinds: ['weigh_in'] })
    expect((await dispatchReminders(at('2025-11-10T14:05:00.000Z'))).sent).toEqual([])
  })
})

describe('what stays quiet', () => {
  it('a kind turned off sends nothing, even when due', async () => {
    await db.update(settings).set({ reminders: { ...DEFAULT_REMINDER_PREFS, water: { enabled: false, time: null } } })
    // Thu 2025-11-13 13:00 MST: nothing logged, far behind pace.
    expect((await dispatchReminders(at('2025-11-13T20:00:00.000Z'))).sent).toEqual([])
  })

  it('a kind this device did not subscribe to sends nothing', async () => {
    await subscribe(at('2025-11-14T12:00:00.000Z') as Deps, { endpoint: ENDPOINT, keys: KEYS, kinds: ['weigh_in'] })
    expect((await dispatchReminders(at('2025-11-14T20:00:00.000Z'))).sent).toEqual([]) // Fri 13:00 MST water slot
  })

  it('a clock reminder set at 21:50 fires at 21:55 but never at 22:00 or later', async () => {
    await db.update(settings).set({ reminders: { ...DEFAULT_REMINDER_PREFS, weigh_in: { enabled: true, time: '21:50' } } })
    expect(kinds(await dispatchReminders(at('2025-11-18T04:55:00.000Z')))).toEqual(['weigh_in']) // Mon 2025-11-17 21:55 MST
    expect((await dispatchReminders(at('2025-11-19T05:00:00.000Z'))).sent).toEqual([]) // Tue 22:00, first tick that day
    expect((await dispatchReminders(at('2025-11-19T05:15:00.000Z'))).sent).toEqual([]) // Tue 22:15, still in grace
  })

  it('a fast that starts at 22:00 gets no start reminder, then or at 07:00', async () => {
    const id = crypto.randomUUID()
    await db.insert(fast_logs).values({ id, started_at: '2025-11-21T05:00:00.000Z', start_date: '2025-11-20', planned: true }) // Thu 22:00 MST
    expect((await dispatchReminders(at('2025-11-21T05:00:00.000Z'))).sent).toEqual([])
    expect((await dispatchReminders(at('2025-11-21T14:00:00.000Z'))).sent.filter((s) => s.kind === 'fast')).toEqual([])
    await db.delete(fast_logs).where(eq(fast_logs.id, id))
  })
})

describe('fasts across the fall back', () => {
  it('a 24 h fast from Sat 2025-11-01 19:00 MDT ends 24 real hours later: Sun 18:00 MST (2025-11-03T01:00Z)', async () => {
    const id = crypto.randomUUID()
    await db.insert(fast_logs).values({ id, started_at: '2025-11-02T01:00:00.000Z', start_date: '2025-11-01', planned: true })
    const fastSent = async (iso: string) => (await dispatchReminders(at(iso))).sent.filter((s) => s.kind === 'fast').map((s) => [s.period_key, s.title])

    expect(await fastSent('2025-11-02T01:00:00.000Z')).toEqual([[`${id}:start`, 'Fast starts now']])
    expect(await fastSent('2025-11-02T01:05:00.000Z')).toEqual([])
    expect(await fastSent('2025-11-03T00:55:00.000Z')).toEqual([])
    expect(await fastSent('2025-11-03T01:00:00.000Z')).toEqual([[`${id}:end`, 'Fast complete']])
    expect(await fastSent('2025-11-03T01:05:00.000Z')).toEqual([])
    await db.delete(fast_logs).where(eq(fast_logs.id, id))
  })
})

describe('water cadence', () => {
  const targets = (date: string, is_fast_day: boolean, water_ml: number) => ({
    date,
    plan_version_id: PLAN,
    kcal: is_fast_day ? 0 : 1400,
    protein_g: 130,
    carbs_g: 119,
    fat_g: 45,
    fibre_g: 30,
    water_ml,
    steps: 8000,
    is_fast_day,
  })

  it('on a fast day the 10:30 check runs (90-minute cadence) against the day’s raised target', async () => {
    await db.insert(daily_targets).values(targets('2025-11-25', true, 4000))
    // Tue 10:30 MST = 17:30Z: expected 4,000 × (210 / 900) = 933 ml, nothing logged.
    expect((await dispatchReminders(at('2025-11-25T17:30:00.000Z'))).sent).toMatchObject([
      { kind: 'water', period_key: '2025-11-25T10:30', title: 'Water (fast day)' },
    ])
    expect(delivered[0]?.notification.body).toBe('0.0 L of 4.0 L so far, about 0.9 L behind pace. Have a glass now.')
  })

  it('on an ordinary day 10:30 is not a check, 11:00 is', async () => {
    await db.insert(daily_targets).values(targets('2025-11-26', false, 3000))
    expect((await dispatchReminders(at('2025-11-26T17:30:00.000Z'))).sent).toEqual([])
    expect((await dispatchReminders(at('2025-11-26T18:00:00.000Z'))).sent).toMatchObject([{ kind: 'water', period_key: '2025-11-26T11:00', title: 'Water' }])
  })
})

describe('the real Web Push adapter', () => {
  const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

  /** Env with a fresh VAPID key pair (push configured), and a browser-like subscription key pair. */
  async function keys() {
    const vapid = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
    const browser = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
    const publicKey = b64url(new Uint8Array((await crypto.subtle.exportKey('raw', vapid.publicKey)) as ArrayBuffer))
    const privateKey = ((await crypto.subtle.exportKey('jwk', vapid.privateKey)) as JsonWebKey).d!
    return {
      env: { ...env, VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: 'mailto:reminders@example.com' },
      sub: {
        p256dh: b64url(new Uint8Array((await crypto.subtle.exportKey('raw', browser.publicKey)) as ArrayBuffer)),
        auth: b64url(crypto.getRandomValues(new Uint8Array(16))),
      },
    }
  }
  const note = { title: 'Weigh-in', body: 'Step on the scale.', url: '/', tag: 'weigh_in' }

  it('never calls an endpoint off the push-service allowlist (a row from a restore); the row is kept', async () => {
    const k = await keys()
    await db.delete(push_subscriptions)
    await db.insert(push_subscriptions).values({ endpoint: 'https://push.evil.example/collect', keys: k.sub, kinds: ['weigh_in'] })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const result = await sendPush(at('2025-11-27T14:00:00.000Z', { env: k.env, pushSender: undefined }), 'weigh_in', note)

    expect(result).toEqual({ configured: true, sent: 0, failed: 1, removed: 0 })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(await db.select({ endpoint: push_subscriptions.endpoint }).from(push_subscriptions)).toEqual([{ endpoint: 'https://push.evil.example/collect' }])
  })

  it('posts an encrypted message with VAPID, TTL, urgency and topic to a known push service; a 410 drops the row', async () => {
    const k = await keys()
    await db.delete(push_subscriptions)
    await db.insert(push_subscriptions).values({ endpoint: ENDPOINT, keys: k.sub, kinds: ['weigh_in'] })
    const requests: Request[] = []
    let status = 201
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      requests.push(new Request(input, init))
      return new Response(null, { status })
    })
    const deps = at('2025-11-27T14:00:00.000Z', { env: k.env, pushSender: undefined })

    expect(await sendPush(deps, 'weigh_in', note, { delivery: { ttl_s: 3 * 3600 } })).toEqual({ configured: true, sent: 1, failed: 0, removed: 0 })
    const [req] = requests
    expect(req?.url).toBe(ENDPOINT)
    expect(req?.method).toBe('POST')
    expect(req?.headers.get('ttl')).toBe('10800')
    expect(req?.headers.get('urgency')).toBe('normal')
    expect(req?.headers.get('topic')).toBe('weigh_in')
    expect(req?.headers.get('content-encoding')).toBe('aes128gcm')
    expect(req?.headers.get('authorization')).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${k.env.VAPID_PUBLIC_KEY}$`))
    expect(new Uint8Array(await req!.arrayBuffer()).byteLength).toBeGreaterThan(86) // header (86 bytes) + ciphertext

    status = 410
    expect(await sendPush(deps, 'weigh_in', note)).toEqual({ configured: true, sent: 0, failed: 0, removed: 1 })
    expect(await db.select().from(push_subscriptions)).toEqual([])
  })
})
