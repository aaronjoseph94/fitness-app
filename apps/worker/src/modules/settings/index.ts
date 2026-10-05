// Owns: the settings module's interface — the profile and the settings row (the rails plus app preferences) as one
// view, and edits to them. Only actor 'user' may move a rail (engine LOCKED_SETTINGS); every edit that changes
// something is logged as one `change` event per entity with each field's from/to. Edits to the inputs of the daily
// targets (training days, the floor and macro minimums) re-materialise the targets.
import { addDays, LOCKED_SETTINGS, today } from '@fitness/shared/engine'
import type { Profile, Settings, SettingsUpdate, SettingsView } from '@fitness/shared/schemas'
import { eq, max } from 'drizzle-orm'
import { ai_events, daily_targets, profile, settings } from '../../db'
import type { Deps } from '../../lib/deps'
import { badRequest, HttpError, notFound } from '../../lib/http-error'
import { materialiseTargets } from '../plan'
import { changedValues, fieldChanges, summarise } from './lib/changes'

/** Settings fields materialiseTargets reads: changing one rebuilds the daily targets. */
const TARGET_INPUTS: readonly string[] = ['training_days', 'calorie_floor', 'protein_min_g', 'fat_min_g']

/** GET /api/settings. */
export async function getSettings(deps: Deps): Promise<SettingsView> {
  const [[p], [s]] = await deps.db.batch([deps.db.select().from(profile).limit(1), deps.db.select().from(settings).limit(1)])
  if (!p || !s) throw notFound('Profile or settings (seed the database)')
  return { profile: p satisfies Profile, settings: s satisfies Settings }
}

/**
 * PATCH /api/settings. Applies the fields that differ, logs them, and returns the new view. 403 rails_locked when a
 * non-user actor tries to move a rail; 400 when the resulting calorie floor would exceed the ceiling.
 */
export async function updateSettings(deps: Deps, input: SettingsUpdate): Promise<SettingsView> {
  const { db } = deps
  const current = await getSettings(deps)
  const settingsChanges = fieldChanges(current.settings, input.settings)
  const profileChanges = fieldChanges(current.profile, input.profile)

  const locked = settingsChanges.filter((c) => LOCKED_SETTINGS.includes(c.path))
  if (deps.actor !== 'user' && locked.length > 0)
    throw new HttpError(403, 'rails_locked', `Only Aaron changes the rails (${locked.map((c) => c.path).join(', ')})`)
  const floor = input.settings?.calorie_floor ?? current.settings.calorie_floor
  const ceiling = input.settings?.calorie_ceiling ?? current.settings.calorie_ceiling
  if (floor > ceiling) throw badRequest(`calorie_floor (${floor}) must not exceed calorie_ceiling (${ceiling})`)
  if (settingsChanges.length === 0 && profileChanges.length === 0) return current

  const now = deps.now().toISOString()
  const event = (entity: 'settings' | 'profile', changes: typeof settingsChanges) =>
    db.insert(ai_events).values({
      kind: 'change',
      actor: deps.actor,
      date: today(now),
      summary: summarise(entity === 'settings' ? 'Settings' : 'Profile', changes),
      body: { entity, changes },
    })
  const writes = [
    ...(settingsChanges.length > 0
      ? [
          db
            .update(settings)
            .set({ ...changedValues<Settings>(settingsChanges), updated_at: now })
            .where(eq(settings.id, current.settings.id)),
          event('settings', settingsChanges),
        ]
      : []),
    ...(profileChanges.length > 0
      ? [
          db
            .update(profile)
            .set({ ...changedValues<Profile>(profileChanges), updated_at: now })
            .where(eq(profile.id, current.profile.id)),
          event('profile', profileChanges),
        ]
      : []),
  ]
  const [first, ...rest] = writes
  await db.batch([first!, ...rest])

  if (settingsChanges.some((c) => TARGET_INPUTS.includes(c.path))) await rebuildTargets(deps, today(now))
  return getSettings(deps)
}

/**
 * Rebuild daily targets from `from` through max(last materialised date, from + 14) — the plan module's horizon rule.
 * The edit is already saved, so a failure is logged rather than failing the request (the next plan change heals it).
 */
async function rebuildTargets(deps: Deps, from: string): Promise<void> {
  try {
    const [row] = await deps.db.select({ last: max(daily_targets.date) }).from(daily_targets)
    const floor = addDays(from, 14)
    await materialiseTargets(deps, { from, to: row?.last && row.last > floor ? row.last : floor })
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', msg: 'targets not rebuilt after settings edit', from, error: String(err) }))
  }
}
