// Owns: the settings module's interface — the profile and the settings row (the rails plus app preferences) as one
// view, and edits to them. Only actor 'user' may move a rail (engine LOCKED_SETTINGS); every edit that changes
// something is logged as one `change` event per entity with each field's from/to. Edits to the inputs of the daily
// targets (training days, the floor and macro minimums, fast hours) rebuild the targets from today on in the same
// db.batch as the edit. The daily water and fibre targets come from the plan version, so a new water_target_ml or
// fibre_target_g also writes a plan version (defaults.water_ml / fibre_g, as deps.actor, through the guards) in that
// batch, which rebuilds the targets from today on. Training days are stored once each in week order, and no path can
// put a clock reminder in the quiet hours (22:00–07:00).
// Interface:
//   getSettings(deps) / updateSettings(deps, { settings?, profile? }) → SettingsView
//   proposeTrainingDays(deps, { training_days, reason? }) → TrainingDaysResult { status, proposal_id, training_days }
//        the days in week order: 'unchanged' when the settings already hold them; actor 'ai' → 'proposed' (a pending
//        training_days proposal with `before` and the AI's `reason`, lib/training-days.ts); 'user' / 'mcp' → 'applied'
//        now through updateSettings (its change event is the record, so proposal_id is null; no Undo — change the days
//        back). 400 for no day.
//   getMcpConnection(deps, origin)       → McpConnectionView  how Claude reaches the app
// Registers the 'training_days' proposal handler for plan.acceptProposal: accepting saves the days (updateSettings as
// the one who taps, which rebuilds the daily targets from today on).
import { LOCKED_SETTINGS, today } from '@fitness/shared/engine'
import {
  AGREED_CALORIE_FLOOR,
  CLOCK_REMINDERS,
  REMINDER_HOURS,
  type Profile,
  type Settings,
  type SettingsUpdate,
  type SettingsView,
  type Weekday,
} from '@fitness/shared/schemas'
import { eq } from 'drizzle-orm'
import { profile, runBatch, settings } from '../../db'
import type { Deps } from '../../lib/deps'
import { badRequest, HttpError, notFound } from '../../lib/http-error'
import { eventInsert } from '../events'
import {
  planChangeStatements,
  registerProposalHandler,
  targetStatementsFor,
  type ProposalOf,
  type ProposalOutcome,
} from '../plan'
import { runSoon } from '../jobs'
import { changedValues, fieldChanges, summarise } from './lib/changes'
import { proposeDays, sameDays, weekOrder, type TrainingDaysResult } from './lib/training-days'

/** How Claude reaches the app (SPEC §8): the connector URL, discovery URLs and the bearer token's status. */
export { getMcpConnection } from './lib/connection'
export type { TrainingDaysResult } from './lib/training-days'

/** Settings fields the daily targets read: changing one rebuilds them. */
const TARGET_INPUTS: readonly string[] = [
  'training_days',
  'calorie_floor',
  'protein_min_g',
  'fat_min_g',
  'fast_hours',
]
/** Settings fields that are plan-version defaults too (the daily targets read the version): settings field → target. */
const PLAN_DEFAULTS = { water_target_ml: 'water_ml', fibre_target_g: 'fibre_g' } as const

/** The record's note when a change takes the calorie floor under the one agreed with the doctor and dietitian. */
function belowAgreedFloor(changes: readonly { path: string; to: unknown }[]): string | undefined {
  const floor = changes.find((c) => c.path === 'calorie_floor')?.to
  return typeof floor === 'number' && floor < AGREED_CALORIE_FLOOR
    ? `below the ${AGREED_CALORIE_FLOOR} kcal floor set with the doctor and dietitian`
    : undefined
}

/** GET /api/settings. */
export async function getSettings(deps: Deps): Promise<SettingsView> {
  const [[p], [s]] = await deps.db.batch([
    deps.db.select().from(profile).limit(1),
    deps.db.select().from(settings).limit(1),
  ])
  if (!p || !s) throw notFound('Profile or settings (seed the database)')
  return { profile: p satisfies Profile, settings: s satisfies Settings }
}

type SettingsPatchInput = SettingsUpdate['settings']

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
    if (
      time &&
      time !== current.reminders[kind]?.time &&
      (time < REMINDER_HOURS.from || time >= REMINDER_HOURS.to)
    )
      throw badRequest(
        `The ${kind} reminder can't be at ${time}: reminders are quiet outside ${REMINDER_HOURS.from}–${REMINDER_HOURS.to}`,
      )
  }
  return patch.training_days ? { ...patch, training_days: weekOrder(patch.training_days) } : patch
}

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
    throw new HttpError(
      403,
      'rails_locked',
      `Only Aaron changes the rails (${locked.map((c) => c.path).join(', ')})`,
    )
  const floor = input.settings?.calorie_floor ?? current.settings.calorie_floor
  const ceiling = input.settings?.calorie_ceiling ?? current.settings.calorie_ceiling
  if (floor > ceiling)
    throw badRequest(`calorie_floor (${floor}) must not exceed calorie_ceiling (${ceiling})`)
  const goal = input.profile?.goal_weight_kg ?? current.profile.goal_weight_kg
  const start = input.profile?.start_weight_kg ?? current.profile.start_weight_kg
  // Only an edit to either weight is checked, so another profile field still saves on a profile that predates the rule.
  const weightEdited =
    input.profile?.goal_weight_kg !== undefined || input.profile?.start_weight_kg !== undefined
  if (weightEdited && goal >= start)
    throw badRequest(`The goal weight (${goal} kg) must be below the start weight (${start} kg)`)
  if (settingsChanges.length === 0 && profileChanges.length === 0) return current

  const now = deps.now().toISOString()
  const event = (entity: 'settings' | 'profile', changes: typeof settingsChanges) =>
    eventInsert(deps, {
      kind: 'change',
      date: today(now),
      summary: summarise(entity === 'settings' ? 'Settings' : 'Profile', changes, belowAgreedFloor(changes)),
      body: { entity, changes },
    }).statement
  const newSettings = changedValues<Settings>(settingsChanges)
  // Water / fibre: a plan version with the new defaults (it rebuilds the targets with the new settings too).
  const planChanges = settingsChanges.flatMap((c) =>
    c.path in PLAN_DEFAULTS
      ? [
          {
            field: PLAN_DEFAULTS[c.path as keyof typeof PLAN_DEFAULTS],
            weekday: null,
            from: 0,
            to: c.to as number,
            reason: 'Settings',
          },
        ]
      : [],
  )
  const version = planChanges.length
    ? await planChangeStatements(
        deps,
        { changes: planChanges, reason: 'Settings: water/fibre target' },
        { settings: newSettings },
      )
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
  await runBatch(db, [...writes, ...(version?.statements ?? []), ...targets])
  if (version?.job_id) runSoon(deps, version.job_id)
  return getSettings(deps)
}

/**
 * Change the training days (Ask AI's set_training_days and plan_training_week, Claude, the Train day chips): the days
 * in week order; unchanged when the settings hold them already; a pending proposal for actor 'ai' (he taps it; its
 * body carries `reason`, the AI's why); saved now for 'user' and 'mcp'.
 */
export async function proposeTrainingDays(
  deps: Deps,
  input: { training_days: readonly Weekday[]; reason?: string },
): Promise<TrainingDaysResult> {
  const training_days = weekOrder(input.training_days)
  if (!training_days.length) throw badRequest('Pick at least one training day')
  const current = (await getSettings(deps)).settings.training_days
  if (sameDays(training_days, weekOrder(current)))
    return { status: 'unchanged', proposal_id: null, training_days }
  if (deps.actor === 'ai')
    return {
      status: 'proposed',
      proposal_id: await proposeDays(deps, { training_days, before: current, reason: input.reason }),
      training_days,
    }
  await updateSettings(deps, { settings: { training_days } })
  return { status: 'applied', proposal_id: null, training_days }
}

/** Accepting a training_days proposal: save its days as the one who taps (the daily targets rebuild from today on). */
async function acceptTrainingDays(
  deps: Deps,
  proposal: ProposalOf<'training_days'>,
): Promise<ProposalOutcome> {
  const view = await updateSettings(deps, { settings: { training_days: proposal.body.training_days } })
  return { plan_version_id: null, applied: { entity: 'settings', id: view.settings.id } }
}

registerProposalHandler('training_days', { accept: acceptTrainingDays })
