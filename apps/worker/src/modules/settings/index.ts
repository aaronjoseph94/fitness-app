// Owns: the settings module's interface — the profile and the settings row (the rails plus app preferences) as one
// view, and edits to them. Only actor 'user' may move a rail (engine LOCKED_SETTINGS); every edit that changes
// something is logged as one `change` event per entity with each field's from/to. Edits to the inputs of the daily
// targets (training days, the floor and macro minimums, fast hours) rebuild the targets from today on in the same
// db.batch as the edit. The daily water and fibre targets come from the plan version, so a new water_target_ml or
// fibre_target_g also writes a plan version (defaults.water_ml / fibre_g, as deps.actor, through the guards) in that
// batch, which rebuilds the targets from today on. Training days are stored once each in week order, and no path can
// put a clock reminder in the quiet hours (22:00–07:00).
import { LOCKED_SETTINGS, today } from '@fitness/shared/engine'
import {
  CLOCK_REMINDERS,
  REMINDER_HOURS,
  Weekday,
  type Profile,
  type Settings,
  type SettingsUpdate,
  type SettingsView,
} from '@fitness/shared/schemas'
import { eq } from 'drizzle-orm'
import { profile, settings } from '../../db'
import type { Deps } from '../../lib/deps'
import { badRequest, HttpError, notFound } from '../../lib/http-error'
import { eventInsert } from '../events'
import { planChangeStatements, targetStatementsFor } from '../plan'
import { runSoon } from '../jobs'
import { changedValues, fieldChanges, summarise } from './lib/changes'

/** How Claude reaches the app (SPEC §8): the connector URL, discovery URLs and the bearer token's status. */
export { getMcpConnection } from './lib/connection'

/** Settings fields the daily targets read: changing one rebuilds them. */
const TARGET_INPUTS: readonly string[] = ['training_days', 'calorie_floor', 'protein_min_g', 'fat_min_g', 'fast_hours']
/** Settings fields that are plan-version defaults too (the daily targets read the version): settings field → target. */
const PLAN_DEFAULTS = { water_target_ml: 'water_ml', fibre_target_g: 'fibre_g' } as const

/** GET /api/settings. */
export async function getSettings(deps: Deps): Promise<SettingsView> {
  const [[p], [s]] = await deps.db.batch([deps.db.select().from(profile).limit(1), deps.db.select().from(settings).limit(1)])
  if (!p || !s) throw notFound('Profile or settings (seed the database)')
  return { profile: p satisfies Profile, settings: s satisfies Settings }
}

/**
 * A settings patch as it is stored, whoever sends it (the app, or a coach review's week_split / reminder_time):
 * training days once each in week order (a repeated day would plan its session twice), and 400 for a clock reminder
 * moved into the quiet hours, where it would never fire (the rule set_reminder_time applies). Unchanged reminders are
 * not re-checked.
 */
function normalise(current: Settings, patch: SettingsPatchInput): SettingsPatchInput {
  if (!patch) return patch
  for (const kind of CLOCK_REMINDERS) {
    const time = patch.reminders?.[kind]?.time
    if (time && time !== current.reminders[kind]?.time && (time < REMINDER_HOURS.from || time >= REMINDER_HOURS.to))
      throw badRequest(`The ${kind} reminder can't be at ${time}: reminders are quiet outside ${REMINDER_HOURS.from}–${REMINDER_HOURS.to}`)
  }
  const days = patch.training_days
  return days ? { ...patch, training_days: Weekday.options.filter((d) => days.includes(d)) } : patch
}
type SettingsPatchInput = SettingsUpdate['settings']

/**
 * PATCH /api/settings. Applies the fields that differ, logs them, and returns the new view. 403 rails_locked when a
 * non-user actor tries to move a rail; 400 when the resulting calorie floor would exceed the ceiling, or a clock
 * reminder would be in the quiet hours.
 */
export async function updateSettings(deps: Deps, input: SettingsUpdate): Promise<SettingsView> {
  const { db } = deps
  const current = await getSettings(deps)
  const settingsChanges = fieldChanges(current.settings, normalise(current.settings, input.settings))
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
    eventInsert(deps, {
      kind: 'change',
      date: today(now),
      summary: summarise(entity === 'settings' ? 'Settings' : 'Profile', changes),
      body: { entity, changes },
    }).statement
  const newSettings = changedValues<Settings>(settingsChanges)
  // Water / fibre: a plan version with the new defaults (it rebuilds the targets with the new settings too).
  const planChanges = settingsChanges.flatMap((c) =>
    c.path in PLAN_DEFAULTS
      ? [{ field: PLAN_DEFAULTS[c.path as keyof typeof PLAN_DEFAULTS], weekday: null, from: 0, to: c.to as number, reason: 'Settings' }]
      : [],
  )
  const version = planChanges.length
    ? await planChangeStatements(deps, { changes: planChanges, reason: 'Settings: water/fibre target' }, { settings: newSettings })
    : null
  // The targets from today through the horizon, as they will be with the new rails (same batch as the edit).
  const targets =
    !version?.job_id && settingsChanges.some((c) => TARGET_INPUTS.includes(c.path))
      ? await targetStatementsFor(deps, { from: today(now) }, { settings: newSettings })
      : []
  const writes = [
    ...(settingsChanges.length > 0
      ? [
          db
            .update(settings)
            .set({ ...newSettings, updated_at: now })
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
  const [first, ...rest] = [...writes, ...(version?.statements ?? []), ...targets]
  await db.batch([first!, ...rest])
  if (version?.job_id) runSoon(deps, version.job_id)
  return getSettings(deps)
}
