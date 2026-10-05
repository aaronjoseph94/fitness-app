// Owns: a Prove-It test at the coach seam (apply_review's week_split change) — the summary the coach and Aaron read
// is the training days as stored (settings de-duplicates and orders them), not the input as typed. Today is Monday
// 2026-10-05; training days Mon–Thu (SPEC §12).
import { ReminderKind, type ReminderPrefs } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createDb, plan_versions, profile, settings } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { applyReview } from '../src/modules/coach'
import { getSettings } from '../src/modules/settings'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
const deps: Deps = { db, env, now: () => new Date('2026-10-05T15:00:00.000Z'), actor: 'mcp', waitUntil: (p) => void pending.push(p.catch(() => undefined)) }
afterEach(async () => {
  await Promise.all(pending.splice(0))
})
const reminders = Object.fromEntries(ReminderKind.options.map((k) => [k, { enabled: true, time: null }])) as ReminderPrefs

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

describe('apply_review week_split', () => {
  it('reports the training days as stored: "thu, mon, mon" reads "mon, thu"', async () => {
    const result = await applyReview(deps, {
      summary: 'Two training days this week',
      narrative: 'A lighter week: Monday and Thursday.',
      changes: [{ kind: 'week_split', training_days: ['thu', 'mon', 'mon'], reason: 'Travel' }],
      record_review: true,
    })

    expect((await getSettings(deps)).settings.training_days).toEqual(['mon', 'thu'])
    expect(result.applied).toEqual([expect.objectContaining({ kind: 'week_split', summary: 'training days mon, thu' })])
  })
})
