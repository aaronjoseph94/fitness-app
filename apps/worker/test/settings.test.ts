// Owns: tests at the settings seam (modules/settings updateSettings) — training days are stored once each in week
// order whoever sends them (the app, or apply_review's week_split from Claude), and a clock reminder can't be moved into
// the quiet hours (22:00–07:00) by any path, as set_reminder_time already refuses.
import { DEFAULT_REMINDER_PREFS } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, plan_versions, profile, settings } from '../src/db'
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
        defaults: { kcal: 1400, protein_g: 130, carbs_g: 119, fat_g: 45, fibre_g: 30, water_ml: 3000, steps: 8000 },
        overrides: {},
      },
      forecast: { finish_date: '2027-04-16', weekly_rate_kg: 1.046, band: { low: 0.837, high: 1.256 }, tdee_est: 2551 },
    }),
  ])
})

describe('updateSettings', () => {
  it('stores training days once each, in week order (a repeated day would count its session twice)', async () => {
    const view = await updateSettings(deps('mcp'), { settings: { training_days: ['thu', 'mon', 'mon', 'tue', 'thu'] } })
    expect(view.settings.training_days).toEqual(['mon', 'tue', 'thu'])
  })

  it('refuses a clock reminder in the quiet hours (it would never fire), for every actor, and keeps the stored time', async () => {
    for (const actor of ['user', 'mcp'] as const) {
      const reminders = { ...DEFAULT_REMINDER_PREFS, weigh_in: { enabled: true, time: '03:00' } }
      await expect(updateSettings(deps(actor), { settings: { reminders } })).rejects.toMatchObject({ status: 400, code: 'invalid_request' })
    }
    expect((await getSettings(deps())).settings.reminders.weigh_in).toEqual({ enabled: true, time: '07:00' })
    // In the waking day it saves.
    const ok = { ...DEFAULT_REMINDER_PREFS, weigh_in: { enabled: true, time: '21:55' } }
    expect((await updateSettings(deps('mcp'), { settings: { reminders: ok } })).settings.reminders.weigh_in.time).toBe('21:55')
  })
})
