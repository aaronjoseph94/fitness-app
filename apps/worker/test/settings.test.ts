// Owns: tests at the settings seam (modules/settings updateSettings) — training days are stored once each in week
// order whoever sends them (the app, or apply_review's week_split from Claude), and a clock reminder can't be moved into
// the quiet hours (22:00–07:00) by any path, as set_reminder_time already refuses.
import { DEFAULT_REMINDER_PREFS, SettingsUpdate } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { desc, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { ai_events, createDb, plan_versions, profile, settings } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { getSettings, updateSettings } from '../src/modules/settings'

const db = createDb(env.DB)
const deps = (actor: Deps['actor'] = 'user'): Deps => ({
  db,
  env,
  now: () => new Date('2026-10-05T18:00:00.000Z'),
  actor,
  waitUntil: () => undefined,
})

beforeAll(async () => {
  await db.batch([
    db.insert(profile).values({
      height_cm: 165.1,
      sex: 'male',
      goal_weight_kg: 65,
      goal_date: '2027-08-04',
      start_weight_kg: 95.1,
      start_date: '2026-09-26',
    }),
    db.insert(settings).values({
      calorie_floor: 1400,
      calorie_ceiling: 1700,
      protein_min_g: 130,
      fat_min_g: 45,
      fibre_target_g: 30,
      water_target_ml: 3000,
      training_days: ['mon', 'tue', 'wed', 'thu'],
      reminders: DEFAULT_REMINDER_PREFS,
    }),
    db.insert(plan_versions).values({
      version: 1,
      active: true,
      created_by: 'user',
      reason: 'Baseline',
      diff: [],
      targets: {
        defaults: {
          kcal: 1400,
          protein_g: 130,
          carbs_g: 119,
          fat_g: 45,
          fibre_g: 30,
          water_ml: 3000,
          steps: 8000,
        },
        overrides: {},
      },
      forecast: {
        finish_date: '2027-04-16',
        weekly_rate_kg: 1.046,
        band: { low: 0.837, high: 1.256 },
        tdee_est: 2551,
      },
    }),
  ])
})

describe('updateSettings', () => {
  it('stores training days once each, in week order (a repeated day would count its session twice)', async () => {
    const view = await updateSettings(deps('mcp'), {
      settings: { training_days: ['thu', 'mon', 'mon', 'tue', 'thu'] },
    })
    expect(view.settings.training_days).toEqual(['mon', 'tue', 'thu'])
  })

  it('refuses a clock reminder in the quiet hours (it would never fire), for every actor, and keeps the stored time', async () => {
    for (const actor of ['user', 'mcp'] as const) {
      const reminders = { ...DEFAULT_REMINDER_PREFS, weigh_in: { enabled: true, time: '03:00' } }
      await expect(updateSettings(deps(actor), { settings: { reminders } })).rejects.toMatchObject({
        status: 400,
        code: 'invalid_request',
      })
    }
    expect((await getSettings(deps())).settings.reminders.weigh_in).toEqual({ enabled: true, time: '07:00' })
    // In the waking day it saves.
    const ok = { ...DEFAULT_REMINDER_PREFS, weigh_in: { enabled: true, time: '21:55' } }
    expect(
      (await updateSettings(deps('mcp'), { settings: { reminders: ok } })).settings.reminders.weigh_in.time,
    ).toBe('21:55')
  })
})

describe('impossible profile values (UX review 2026-10-23)', () => {
  it('the shared contract refuses a time zone the runtime does not know and a goal outside 40–200 kg', () => {
    expect(SettingsUpdate.safeParse({ profile: { timezone: 'Mars/Base' } }).success).toBe(false)
    expect(SettingsUpdate.safeParse({ profile: { timezone: 'America/Edmonton' } }).success).toBe(true)
    expect(SettingsUpdate.safeParse({ profile: { goal_weight_kg: 200.5 } }).success).toBe(false)
    expect(SettingsUpdate.safeParse({ profile: { goal_weight_kg: 39 } }).success).toBe(false)
    expect(SettingsUpdate.safeParse({ profile: { goal_weight_kg: 65, start_weight_kg: 60 } }).success).toBe(
      false,
    )
  })

  it('PATCH /api/settings answers 400 for Mars/Base (the route validates with the shared contract)', async () => {
    const res = await createApp().request(
      'http://localhost/api/settings',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: { timezone: 'Mars/Base' } }),
      },
      env,
    )
    expect(res.status).toBe(400)
  })

  it('refuses a goal at or above the stored start weight (95.1 kg) and keeps the stored goal', async () => {
    await expect(updateSettings(deps(), { profile: { goal_weight_kg: 96 } })).rejects.toMatchObject({
      status: 400,
    })
    expect((await getSettings(deps())).profile.goal_weight_kg).toBe(65)
  })
})

describe('the calorie floor is Aaron’s to move, and the move is recorded', () => {
  it('saves a 1,300 kcal floor for the user and writes a change event naming the agreed 1,400 floor', async () => {
    const view = await updateSettings(deps(), { settings: { calorie_floor: 1300 } })
    expect(view.settings.calorie_floor).toBe(1300)
    const [event] = await db
      .select()
      .from(ai_events)
      .where(eq(ai_events.kind, 'change'))
      .orderBy(desc(ai_events.created_at))
      .limit(1)
    expect(event?.actor).toBe('user')
    expect(event?.summary).toBe(
      'Settings changed: calorie_floor 1400 → 1300 (below the 1400 kcal floor set with the doctor and dietitian)',
    )
    // Undo is the same edit back.
    expect((await updateSettings(deps(), { settings: { calorie_floor: 1400 } })).settings.calorie_floor).toBe(
      1400,
    )
  })
})
