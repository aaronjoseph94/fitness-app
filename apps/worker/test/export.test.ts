// Owns: tests at the export seam (modules/export through the /api routes) — an export restores into a fresh instance
// row for row (a second export deep-equals the first, table by table), a restore refuses a used instance unless told
// to overwrite and keeps the rails Aaron's, a page whose settings, plan versions or daily targets break their schemas
// (or the floor ≤ ceiling rail), or that holds more than one settings / profile row, is refused whole with 422, and
// the monthly backup writes one table per cron tick.
import {
  ExportTable,
  ReminderKind,
  type ExportManifest,
  type ExportPage,
  type ExportRow,
  type ReminderPrefs,
} from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { count, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createDb,
  daily_targets,
  foods,
  meal_items,
  meal_photos,
  meals,
  plan_versions,
  profile,
  settings,
  weight_logs,
} from '../src/db'
import type { AppEnv } from '../src/env'
import type { Deps } from '../src/lib/deps'
import { auth } from '../src/middleware/auth'
import { handleError } from '../src/middleware/errors'
import { importTablePage, monthlyBackupStep } from '../src/modules/export'
import { mountExportRoutes } from '../src/routes/export'
import { mountFilesRoutes } from '../src/routes/files'

/** The app's auth, error body and the export + files route groups (the rest of the API is not needed here). */
const app = new Hono<AppEnv>()
app.use('/api/*', auth())
mountExportRoutes(app)
mountFilesRoutes(app)
app.onError(handleError)
const db = createDb(env.DB)
const api = (path: string, init?: RequestInit) => app.request(`http://localhost${path}`, init, env)
const deps = (actor: Deps['actor'] = 'user'): Deps => ({
  db,
  env,
  now: () => new Date('2026-11-01T08:05:00.000Z'), // 01:05 MDT on 1 November
  actor,
  waitUntil: () => undefined,
})

const WEIGH_INS = 600 // more than one 500-row export page
const MEALS = 3
const photoKey = `meal-photos/${crypto.randomUUID()}.jpg`
const photoBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
const reminders = Object.fromEntries(
  ReminderKind.options.map((k) => [k, { enabled: true, time: null }]),
) as ReminderPrefs

const planId = crypto.randomUUID()

beforeAll(async () => {
  const foodId = crypto.randomUUID()
  const mealIds = Array.from({ length: MEALS }, () => crypto.randomUUID())
  const weighIns = Array.from({ length: WEIGH_INS }, (_, i) => ({
    date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
    weight_kg: 95.1 - i * 0.01,
  }))
  await db.batch([
    db
      .insert(profile)
      .values({
        height_cm: 165.1,
        sex: 'male',
        goal_weight_kg: 65,
        goal_date: '2027-08-04',
        start_weight_kg: 95.1,
        start_date: '2026-09-26',
      }),
    db.insert(settings).values({
      protein_min_g: 130,
      fat_min_g: 45,
      fibre_target_g: 30,
      water_target_ml: 3000,
      training_days: ['mon', 'tue', 'wed', 'thu'],
      reminders,
    }),
    db.insert(plan_versions).values({
      id: planId,
      version: 1,
      active: true,
      created_by: 'user',
      reason: 'Baseline rails',
      diff: [],
      targets: {
        defaults: {
          kcal: 1400,
          protein_g: 130,
          carbs_g: 118.75,
          fat_g: 45,
          fibre_g: 30,
          water_ml: 3000,
          steps: 8000,
        },
        overrides: {},
      },
    }),
    db
      .insert(daily_targets)
      .values({
        date: '2026-10-05',
        plan_version_id: planId,
        kcal: 1400,
        protein_g: 130,
        carbs_g: 118.75,
        fat_g: 45,
        fibre_g: 30,
        water_ml: 3000,
        steps: 8000,
      }),
    db
      .insert(foods)
      .values({
        id: foodId,
        source: 'user',
        name: 'Chicken breast',
        kcal_per_100g: 165,
        protein_g: 31,
        fat_g: 3.6,
      }),
    ...mealIds.map((id, i) =>
      db
        .insert(meals)
        .values({
          id,
          date: `2026-10-0${i + 1}`,
          slot: 'dinner',
          input_method: 'manual',
          status: 'confirmed',
        }),
    ),
    ...mealIds.map((meal_id) =>
      db
        .insert(meal_items)
        .values({ meal_id, food_id: foodId, description: 'Chicken breast', grams: 200, kcal: 330 }),
    ),
    db.insert(meal_photos).values({ meal_id: mealIds[0]!, storage_path: photoKey, width: 1024, height: 768 }),
    ...Array.from({ length: Math.ceil(WEIGH_INS / 10) }, (_, i) =>
      db.insert(weight_logs).values(weighIns.slice(i * 10, i * 10 + 10)),
    ),
  ])
  await env.FILES.put(photoKey, photoBytes, { httpMetadata: { contentType: 'image/jpeg' } })
})

const counted = async () => {
  const [[w], [m], [i]] = await db.batch([
    db.select({ n: count() }).from(weight_logs),
    db.select({ n: count() }).from(meals),
    db.select({ n: count() }).from(meal_items),
  ])
  return { weight_logs: w!.n, meals: m!.n, meal_items: i!.n }
}

/** Empty every exported table and the restore markers, as a fresh instance before its seed. */
async function wipe() {
  const tables = [...ExportTable.options].reverse()
  await db.batch([
    db.run(sql`PRAGMA defer_foreign_keys = on`),
    ...tables.map((t) => db.run(sql.raw(`DELETE FROM "${t}"`))),
    db.run(sql`DELETE FROM cron_runs`),
  ])
  await env.FILES.delete(photoKey)
}

/** The browser's export: the manifest, then every table page by page. */
async function exportAll() {
  const manifest = (await (await api('/api/export')).json()) as ExportManifest
  const tables: Partial<Record<ExportTable, ExportRow[]>> = {}
  let pages = 0
  for (const { table, rows } of manifest.tables) {
    if (rows === 0) continue
    let cursor: string | null = ''
    const all: ExportRow[] = []
    while (cursor !== null) {
      const res = await api(`/api/export/tables?table=${table}${cursor ? `&cursor=${cursor}` : ''}`)
      expect(res.status).toBe(200)
      const page = (await res.json()) as ExportPage
      all.push(...page.rows)
      cursor = page.next_cursor
      pages++
    }
    tables[table] = all
  }
  return { manifest, tables, pages }
}

describe('export and restore through the routes', () => {
  it('restores an export into a fresh instance row for row: exporting again deep-equals every table', async () => {
    const before = await counted()
    expect(before).toEqual({ weight_logs: WEIGH_INS, meals: MEALS, meal_items: MEALS })

    const { manifest, tables, pages } = await exportAll()
    expect(manifest.tables.find((t) => t.table === 'weight_logs')?.rows).toBe(WEIGH_INS)
    expect(tables.weight_logs).toHaveLength(WEIGH_INS)
    expect(pages).toBeGreaterThanOrEqual(2 + 6) // weight_logs takes two pages
    expect(tables.settings?.[0]?.training_days).toBe('["mon","tue","wed","thu"]') // JSON columns travel as stored text
    expect(manifest.files.map((f) => f.key)).toEqual([photoKey])
    const photo = new Uint8Array(await (await api(manifest.files[0]!.url)).arrayBuffer())

    await wipe()
    // A fresh instance: the seed's baseline weigh-in and plan v1, and targets materialised under ids of its own.
    await db.batch([
      db
        .insert(plan_versions)
        .values({
          id: planId,
          version: 1,
          active: true,
          created_by: 'user',
          reason: 'Seed',
          diff: [],
          targets: {
            defaults: {
              kcal: 1400,
              protein_g: 130,
              carbs_g: 118.75,
              fat_g: 45,
              fibre_g: 30,
              water_ml: 3000,
              steps: 8000,
            },
            overrides: {},
          },
        }),
      db
        .insert(daily_targets)
        .values({
          date: '2026-10-05',
          plan_version_id: planId,
          kcal: 1500,
          protein_g: 130,
          carbs_g: 118.75,
          fat_g: 45,
          fibre_g: 30,
          water_ml: 3000,
          steps: 8000,
        }),
      db.insert(weight_logs).values({ date: '2025-01-01', weight_kg: 99 }),
    ])

    const restore_id = crypto.randomUUID()
    for (const table of ExportTable.options) {
      const rows = tables[table] ?? []
      for (let at = 0; at < rows.length; at += 500) {
        const res = await api('/api/import', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ restore_id, table, rows: rows.slice(at, at + 500) }),
        })
        expect(res.status, `${table}: ${await res.clone().text()}`).toBe(200)
      }
    }
    const put = await api(`/api/import/files?key=${encodeURIComponent(photoKey)}&restore_id=${restore_id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: photo,
    })
    expect(put.status).toBe(200)

    expect(await counted()).toEqual(before)
    const [w] = await db
      .select()
      .from(weight_logs)
      .where(sql`date = '2025-01-01'`)
    expect(w?.weight_kg).toBe(95.1)
    expect(await db.select({ id: daily_targets.id, kcal: daily_targets.kcal }).from(daily_targets)).toEqual([
      { id: tables.daily_targets?.[0]?.id, kcal: 1400 },
    ])
    const [s] = await db.select().from(settings)
    expect(s?.training_days).toEqual(['mon', 'tue', 'wed', 'thu'])
    const stored = await env.FILES.get(photoKey)
    expect(stored?.httpMetadata?.contentType).toBe('image/jpeg')
    expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(photoBytes)

    // Every exported table comes back exactly; the only addition is the restore's own "settings restored" event.
    const again = await exportAll()
    for (const table of ExportTable.options) {
      const restored = again.tables[table] ?? []
      if (table === 'ai_events') {
        const isRestore = (r: ExportRow) => String(r.summary).startsWith('Settings and rails restored')
        expect(restored.filter(isRestore), table).toEqual([expect.objectContaining({ kind: 'change', actor: 'user' })])
        expect(restored.filter((r) => !isRestore(r)), table).toEqual(tables.ai_events ?? [])
      } else expect(restored, table).toEqual(tables[table] ?? [])
    }
  })

  it('refuses a restore over logged data unless overwrite is set, and replaying a page changes nothing', async () => {
    const { tables } = await exportAll()
    const page = { table: 'weight_logs' as const, rows: tables.weight_logs!.slice(0, 100) }

    await expect(
      importTablePage(deps(), { restore_id: crypto.randomUUID(), overwrite: false, ...page }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'not_fresh',
    })
    const restore_id = crypto.randomUUID()
    await importTablePage(deps(), { restore_id, overwrite: true, ...page })
    await importTablePage(deps(), { restore_id, overwrite: false, ...page }) // same restore: passes the gate
    expect((await counted()).weight_logs).toBe(WEIGH_INS)

    await expect(
      importTablePage(deps('mcp'), {
        restore_id,
        overwrite: true,
        table: 'settings',
        rows: tables.settings!,
      }),
    ).rejects.toMatchObject({ status: 403, code: 'rails_locked' })
  })
})

describe('restore validates what it writes', () => {
  const page = (table: 'settings' | 'plan_versions' | 'daily_targets', rows: ExportRow[]) =>
    importTablePage(deps(), { restore_id: crypto.randomUUID(), overwrite: true, table, rows })

  it('refuses settings whose floor is above the ceiling or outside the daily kcal bounds, and keeps the stored rails', async () => {
    const { tables } = await exportAll()
    const row = tables.settings![0]!
    for (const bad of [
      { ...row, calorie_floor: 1800, calorie_ceiling: 1700 },
      { ...row, calorie_floor: 300 },
      { ...row, training_days: '["someday"]' },
      { ...row, reminders: 'not json' },
    ])
      await expect(page('settings', [bad])).rejects.toMatchObject({ status: 422, code: 'invalid_rows' })
    const [s] = await db.select().from(settings)
    expect(s).toMatchObject({ calorie_floor: row.calorie_floor, calorie_ceiling: row.calorie_ceiling })
  })

  it('refuses a settings or profile page with more than one row (one set of rails), and stores nothing', async () => {
    const { tables } = await exportAll()
    const row = tables.settings![0]!
    const second = { ...row, id: crypto.randomUUID(), calorie_floor: 800, calorie_ceiling: 900 }
    await expect(page('settings', [row, second])).rejects.toMatchObject({ status: 422, code: 'invalid_rows' })
    expect(await db.$count(settings)).toBe(1)
    const me = tables.profile![0]!
    await expect(
      importTablePage(deps(), { restore_id: crypto.randomUUID(), overwrite: true, table: 'profile', rows: [me, { ...me, id: crypto.randomUUID() }] }),
    ).rejects.toMatchObject({ status: 422, code: 'invalid_rows' })
    expect(await db.$count(profile)).toBe(1)
  })

  it('refuses plan versions whose targets break PlanTargets and daily targets that break DailyTargets', async () => {
    const { tables } = await exportAll()
    const version = tables.plan_versions![0]!
    const badTargets = JSON.stringify({ defaults: { kcal: -5, protein_g: 130 }, overrides: {} })
    await expect(page('plan_versions', [{ ...version, targets: badTargets }])).rejects.toMatchObject({ status: 422, code: 'invalid_rows' })
    const day = tables.daily_targets![0]!
    await expect(page('daily_targets', [{ ...day, kcal: 'lots' }])).rejects.toMatchObject({ status: 422, code: 'invalid_rows' })
    await expect(page('daily_targets', [{ ...day, date: 'tomorrow' }])).rejects.toMatchObject({ status: 422, code: 'invalid_rows' })
    // The exported rows themselves are valid.
    await expect(page('plan_versions', [version])).resolves.toEqual({ table: 'plan_versions', upserted: 1 })
  })
})

describe('monthly backup', () => {
  it('writes one table per tick to reports/backup/<month>/<table>.json', async () => {
    const first = await monthlyBackupStep(deps('ai'), '2026-11')
    expect(first).toEqual({ table: 'profile', done: 1, of: ExportTable.options.length })
    const second = await monthlyBackupStep(deps('ai'), '2026-11')
    expect(second.table).toBe('settings')

    for (let i = 2; i < ExportTable.options.length; i++) await monthlyBackupStep(deps('ai'), '2026-11')
    expect(await monthlyBackupStep(deps('ai'), '2026-11')).toEqual({ table: null, done: 33, of: 33 })

    const file = await env.FILES.get('reports/backup/2026-11/weight_logs.json')
    const body = (await file!.json()) as { table: string; rows: ExportRow[] }
    expect(body.table).toBe('weight_logs')
    expect(body.rows).toHaveLength(WEIGH_INS)
  })
})
