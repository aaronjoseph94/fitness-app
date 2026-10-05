// Owns: tests at the cron seam (runCron) for dispatch by Edmonton local time — every kind runs once per local period
// at its local hour, never twice for overlapping or retried ticks, catches up after missed ticks, and keeps doing so
// across Edmonton's clock changes, a month end and the year end. Ticks are driven every 5 minutes over a UTC window
// with a pinned clock; expected instants are written out.
//
// Edmonton's offsets (IANA tzdb, as the Workers runtime's Intl applies them):
//   last fall back   Sun 2025-11-02 02:00 MDT → 01:00 MST (08:00Z): 01:00–02:00 happens twice
//   last spring fwd  Sun 2026-03-08 02:00 MST → 03:00 MDT (09:00Z): 02:00–03:00 doesn't exist
//   tzdb 2026c       Alberta moved to permanent UTC−6 (legally 2026-06-18): no fall back on 2026-11-01 and no
//                    spring forward on 2027-03-14; from then on 00:30 local is always 06:30Z.
// Tests run in date order and share one database.
import { ReminderKind, type ReminderPrefs } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { and, between, desc, eq, like } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { runCron, type CronKind } from '../src/cron'
import { createDb, cron_runs, daily_targets, plan_versions, profile, settings } from '../src/db'
import type { Deps } from '../src/lib/deps'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
const at = (now: string): Deps => ({ db, env, now: () => new Date(now), actor: 'ai', waitUntil: (p) => void pending.push(p.catch(() => undefined)) })
afterEach(async () => {
  await Promise.all(pending.splice(0))
})
const reminders = Object.fromEntries(ReminderKind.options.map((k) => [k, { enabled: true, time: null }])) as ReminderPrefs

const FIVE_MIN = 5 * 60_000

/** Run one tick every 5 minutes from `from` to `to` (UTC, inclusive); the ticks where a kind ran or failed. */
async function ticks(from: string, to: string): Promise<[string, string[]][]> {
  const out: [string, string[]][] = []
  for (let t = Date.parse(from); t <= Date.parse(to); t += FIVE_MIN) {
    const iso = new Date(t).toISOString()
    const r = await runCron(at(iso))
    await Promise.all(pending.splice(0))
    const kinds = [...r.ran, ...r.failed.map((k) => `failed:${k}`)]
    if (kinds.length > 0) out.push([iso, kinds])
  }
  return out
}

/** cron_runs claims of a kind for these period keys: [period_key, ran_at]. */
const claimed = async (kind: CronKind, ...keys: string[]) =>
  (await db.select({ period_key: cron_runs.period_key, ran_at: cron_runs.ran_at }).from(cron_runs).where(eq(cron_runs.kind, kind)))
    .filter((r) => keys.includes(r.period_key))
    .map((r) => [r.period_key, r.ran_at])
    .sort()

/** Backup claims (one per table) made between two instants: their period keys and times, oldest first. */
const backups = async (from: string, to: string) =>
  (
    await db
      .select({ period_key: cron_runs.period_key, ran_at: cron_runs.ran_at })
      .from(cron_runs)
      .where(and(like(cron_runs.kind, 'backup:%'), between(cron_runs.ran_at, from, to)))
  ).sort((a, b) => a.ran_at.localeCompare(b.ran_at))

const lastTargetDate = async () =>
  (await db.select({ date: daily_targets.date }).from(daily_targets).orderBy(desc(daily_targets.date)).limit(1))[0]?.date

beforeAll(async () => {
  await db.batch([
    db.insert(profile).values({ height_cm: 165.1, sex: 'male', goal_weight_kg: 65, goal_date: '2027-08-04', start_weight_kg: 95.1, start_date: '2025-10-01' }),
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

describe('month end (Fri 2025-10-31 → Sat 2025-11-01, MDT)', () => {
  it('nightly catches up the 31st at 23:00 and runs the 1st at 00:30', async () => {
    // Fri 2025-10-31 23:00 MDT = 2025-11-01T05:00Z; Sat 2025-11-01 00:30 MDT = 06:30Z.
    expect(await ticks('2025-11-01T05:00:00.000Z', '2025-11-01T07:30:00.000Z')).toEqual([
      ['2025-11-01T05:00:00.000Z', ['nightly']],
      ['2025-11-01T06:30:00.000Z', ['nightly']],
    ])
    expect(await claimed('nightly', '2025-10-31', '2025-11-01')).toEqual([
      ['2025-10-31', '2025-11-01T05:00:00.000Z'],
      ['2025-11-01', '2025-11-01T06:30:00.000Z'],
    ])
  })

  it('the monthly backup files October until 23:55, pauses until 01:00, then starts November (one table a tick)', async () => {
    const rows = await backups('2025-11-01T05:00:00.000Z', '2025-11-01T07:30:00.000Z')

    expect(rows.filter((r) => r.period_key === '2025-10').map((r) => r.ran_at)).toEqual(
      ['05:00', '05:05', '05:10', '05:15', '05:20', '05:25', '05:30', '05:35', '05:40', '05:45', '05:50', '05:55'].map((t) => `2025-11-01T${t}:00.000Z`),
    )
    expect(rows.filter((r) => r.ran_at >= '2025-11-01T06:00:00.000Z' && r.ran_at < '2025-11-01T07:00:00.000Z')).toEqual([])
    expect(rows.filter((r) => r.period_key === '2025-11').map((r) => r.ran_at)).toEqual(
      ['07:00', '07:05', '07:10', '07:15', '07:20', '07:25', '07:30'].map((t) => `2025-11-01T${t}:00.000Z`),
    )
  })
})

describe('fall back (Sun 2025-11-02: 01:00–02:00 happens twice)', () => {
  it('nightly runs once for 2025-11-02 at 00:30 MDT and not again in either 01:00 hour', async () => {
    // Sat 23:00 MDT (05:00Z) … Sun 03:00 MST (10:00Z). 01:00 MDT = 07:00Z; 01:00 MST = 08:00Z.
    expect(await ticks('2025-11-02T05:00:00.000Z', '2025-11-02T10:00:00.000Z')).toEqual([['2025-11-02T06:30:00.000Z', ['nightly']]])
    expect(await lastTargetDate()).toBe('2025-11-16') // 2025-11-02 + 14
  })

  it('weekly runs once for 2025-W44 at Sunday 20:00 MST (03:00Z Monday), not at 02:00Z (20:00 on summer time)', async () => {
    expect(await ticks('2025-11-03T01:30:00.000Z', '2025-11-03T04:00:00.000Z')).toEqual([['2025-11-03T03:00:00.000Z', ['weekly']]])
    expect(await claimed('weekly', '2025-W44')).toEqual([['2025-W44', '2025-11-03T03:00:00.000Z']])
  })

  it('Monday’s catch-up window does not run 2025-W44 again; its nightly runs at 00:30 MST (07:30Z)', async () => {
    expect(await ticks('2025-11-03T07:20:00.000Z', '2025-11-03T07:40:00.000Z')).toEqual([['2025-11-03T07:30:00.000Z', ['nightly']]])
    expect(await ticks('2025-11-03T16:00:00.000Z', '2025-11-03T16:00:00.000Z')).toEqual([]) // Mon 09:00 MST
  })
})

describe('spring forward (Sun 2026-03-08: 02:00–03:00 doesn’t exist)', () => {
  it('nightly runs once for 2026-03-08 at 00:30 MST (07:30Z)', async () => {
    // Sat 2026-03-07 23:00 MST (06:00Z, catch-up for the 7th) … Sun 05:00 MDT (11:00Z). 09:00Z reads 03:00 MDT.
    expect(await ticks('2026-03-08T06:00:00.000Z', '2026-03-08T11:00:00.000Z')).toEqual([
      ['2026-03-08T06:00:00.000Z', ['nightly']],
      ['2026-03-08T07:30:00.000Z', ['nightly']],
    ])
    expect(await claimed('nightly', '2026-03-07', '2026-03-08')).toEqual([
      ['2026-03-07', '2026-03-08T06:00:00.000Z'],
      ['2026-03-08', '2026-03-08T07:30:00.000Z'],
    ])
    expect(await lastTargetDate()).toBe('2026-03-22')
  })

  it('weekly runs once for 2026-W10 at Sunday 20:00 MDT (02:00Z Monday)', async () => {
    expect(await ticks('2026-03-09T01:00:00.000Z', '2026-03-09T04:00:00.000Z')).toEqual([['2026-03-09T02:00:00.000Z', ['weekly']]])
    expect(await claimed('weekly', '2026-W10')).toEqual([['2026-W10', '2026-03-09T02:00:00.000Z']])
  })

  it('the nightly for Mon 2026-03-09 runs at 00:30 MDT (06:30Z), the first day on summer time', async () => {
    expect(await ticks('2026-03-09T06:20:00.000Z', '2026-03-09T06:40:00.000Z')).toEqual([['2026-03-09T06:30:00.000Z', ['nightly']]])
  })
})

describe('nightly on an ordinary day (UTC−6)', () => {
  it('runs at 00:30 local, not at 00:00 or 00:25 (midnight reads as 00:00, not 24:00)', async () => {
    // Mon 2026-10-12 23:55 = 2026-10-13T05:55Z (catches up the 12th); Tue 2026-10-13 00:00 = 06:00Z.
    expect(await ticks('2026-10-13T05:55:00.000Z', '2026-10-13T06:40:00.000Z')).toEqual([
      ['2026-10-13T05:55:00.000Z', ['nightly']],
      ['2026-10-13T06:30:00.000Z', ['nightly']],
    ])
    expect(await claimed('nightly', '2026-10-12', '2026-10-13')).toEqual([
      ['2026-10-12', '2026-10-13T05:55:00.000Z'],
      ['2026-10-13', '2026-10-13T06:30:00.000Z'],
    ])
    expect(await lastTargetDate()).toBe('2026-10-27') // 2026-10-13 + 14
  })

  it('a retried tick and two overlapping ticks run it once', async () => {
    // Wed 2026-10-14 00:30, twice in parallel, then the same instant again.
    const both = await Promise.all([runCron(at('2026-10-14T06:30:00.000Z')), runCron(at('2026-10-14T06:30:00.000Z'))])
    const again = await runCron(at('2026-10-14T06:30:00.000Z'))

    expect(both.map((r) => r.ran).sort()).toEqual([[], ['nightly']])
    expect(again.ran).toEqual([])
    expect(await claimed('nightly', '2026-10-14')).toEqual([['2026-10-14', '2026-10-14T06:30:00.000Z']])
  })

  it('catches up when the Worker was down over 00:30: the first tick that day runs it', async () => {
    // Thu 2026-10-15: no tick from 00:00 to 09:55; 10:00 = 16:00Z.
    expect(await ticks('2026-10-15T16:00:00.000Z', '2026-10-15T16:10:00.000Z')).toEqual([['2026-10-15T16:00:00.000Z', ['nightly']]])
  })
})

describe('Sun 2026-11-01 under tzdb 2026c (Alberta on permanent UTC−6: no fall back)', () => {
  it('nightly runs once for 2026-11-01 at 06:30Z and nothing repeats at 07:00Z–08:55Z', async () => {
    // Sat 2026-10-31 23:00 = 05:00Z (catch-up for the 31st) … Sun 04:00 = 10:00Z.
    expect(await ticks('2026-11-01T05:00:00.000Z', '2026-11-01T10:00:00.000Z')).toEqual([
      ['2026-11-01T05:00:00.000Z', ['nightly']],
      ['2026-11-01T06:30:00.000Z', ['nightly']],
    ])
    expect(await lastTargetDate()).toBe('2026-11-15')
  })

  it('the backup switches from 2026-10 to 2026-11 at 01:00 local (07:00Z)', async () => {
    const rows = await backups('2026-11-01T05:00:00.000Z', '2026-11-01T10:00:00.000Z')

    expect(rows.filter((r) => r.period_key === '2026-10').at(-1)?.ran_at).toBe('2026-11-01T05:55:00.000Z')
    expect(rows.filter((r) => r.ran_at >= '2026-11-01T06:00:00.000Z' && r.ran_at < '2026-11-01T07:00:00.000Z')).toEqual([])
    expect(rows.filter((r) => r.period_key === '2026-11')[0]?.ran_at).toBe('2026-11-01T07:00:00.000Z')
  })

  it('weekly runs once for 2026-W44 at Sunday 20:00 = 02:00Z Monday (not 03:00Z as on the old MST rule)', async () => {
    expect(await ticks('2026-11-02T01:00:00.000Z', '2026-11-02T04:00:00.000Z')).toEqual([['2026-11-02T02:00:00.000Z', ['weekly']]])
    expect(await claimed('weekly', '2026-W44')).toEqual([['2026-W44', '2026-11-02T02:00:00.000Z']])
  })
})

describe('weekly catch-up after an outage', () => {
  it('a Worker down from Sunday 2026-11-08 19:00 until Monday 11:55 runs 2026-W45 on its first tick', async () => {
    // Mon 2026-11-09 11:55 = 17:55Z.
    expect(await ticks('2026-11-09T17:55:00.000Z', '2026-11-09T18:05:00.000Z')).toEqual([['2026-11-09T17:55:00.000Z', ['nightly', 'weekly']]])
    expect(await claimed('weekly', '2026-W45')).toEqual([['2026-W45', '2026-11-09T17:55:00.000Z']])
  })

  it('back at Monday 12:00 or later: the week is left (PROGRESS decision: catch-up only before 12:00)', async () => {
    // Mon 2026-11-16 12:00 = 18:00Z; 2026-W46 had no Sunday tick.
    expect(await ticks('2026-11-16T18:00:00.000Z', '2026-11-16T18:00:00.000Z')).toEqual([['2026-11-16T18:00:00.000Z', ['nightly']]])
    expect(await claimed('weekly', '2026-W46')).toEqual([])
  })
})

describe('year end (UTC−6)', () => {
  it('nightly runs for 2026-12-31 and 2027-01-01, each once; the January backup starts at 01:00', async () => {
    // Thu 2026-12-31 23:00 = 2027-01-01T05:00Z (catch-up), Fri 2027-01-01 00:30 = 06:30Z, 01:00 = 07:00Z.
    expect(await ticks('2027-01-01T05:00:00.000Z', '2027-01-01T07:30:00.000Z')).toEqual([
      ['2027-01-01T05:00:00.000Z', ['nightly']],
      ['2027-01-01T06:30:00.000Z', ['nightly']],
    ])
    const rows = await backups('2027-01-01T05:00:00.000Z', '2027-01-01T07:30:00.000Z')
    expect(rows.filter((r) => r.period_key === '2027-01')[0]?.ran_at).toBe('2027-01-01T07:00:00.000Z')
    expect(await lastTargetDate()).toBe('2027-01-15')
  })

  it('the week ending Sun 2027-01-03 is 2026-W53 (ISO year 2026), run once at Sunday 20:00', async () => {
    // Sun 2027-01-03 19:30 = 2027-01-04T01:30Z is that day's first tick, so it catches up the 3rd's nightly.
    expect(await ticks('2027-01-04T01:30:00.000Z', '2027-01-04T03:30:00.000Z')).toEqual([
      ['2027-01-04T01:30:00.000Z', ['nightly']],
      ['2027-01-04T02:00:00.000Z', ['weekly']],
    ])
    expect(await claimed('weekly', '2026-W53', '2027-W01')).toEqual([['2026-W53', '2027-01-04T02:00:00.000Z']])
    // Mon 2027-01-04 09:00 = 15:00Z: the catch-up finds the week claimed.
    expect(await ticks('2027-01-04T15:00:00.000Z', '2027-01-04T15:00:00.000Z')).toEqual([['2027-01-04T15:00:00.000Z', ['nightly']]])
  })
})

describe('Sun 2027-03-14 under tzdb 2026c (no spring forward)', () => {
  it('nightly runs once for 2027-03-14 at 06:30Z', async () => {
    expect(await ticks('2027-03-14T05:00:00.000Z', '2027-03-14T10:00:00.000Z')).toEqual([
      ['2027-03-14T05:00:00.000Z', ['nightly']], // Sat 2027-03-13, caught up at 23:00
      ['2027-03-14T06:30:00.000Z', ['nightly']],
    ])
  })
})
