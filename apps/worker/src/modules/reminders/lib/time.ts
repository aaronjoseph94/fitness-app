// Owns: moving a clock reminder (weigh-in, workout, scan due) to a new Edmonton time — a safe-list change (SPEC §9):
// guarded through the plan module, then saved now (Aaron, Claude; Ask AI only with auto_apply_safe on) or stored as a
// pending 'reminder_time' proposal; and what accepting that proposal does. The save is a settings edit (logged there).
import { DEFAULT_REMINDER_PREFS, REMINDER_HOURS, type ClockReminder, type ProposalApplied, type ReminderPrefs } from '@fitness/shared/schemas'
import type { Deps } from '../../../lib/deps'
import { badRequest } from '../../../lib/http-error'
import { applySafeChange, type ProposalOf, type SafeChangeResult } from '../../plan'
import { getSettings, updateSettings } from '../../settings'

const LABEL: Record<ClockReminder, string> = { weigh_in: 'Weigh-in', workout: 'Workout', scan_due: 'Scan due' }

/** Save the new time (the reminder's on/off stays as it is); returns the reminder prefs and the settings row id. */
async function saveTime(deps: Deps, kind: ClockReminder, time: string): Promise<{ reminders: ReminderPrefs; settings_id: string }> {
  const { settings } = await getSettings(deps)
  const current: ReminderPrefs = { ...DEFAULT_REMINDER_PREFS, ...settings.reminders }
  const reminders: ReminderPrefs = { ...current, [kind]: { enabled: current[kind]?.enabled ?? true, time } }
  const view = await updateSettings(deps, { settings: { reminders } })
  return { reminders: view.settings.reminders, settings_id: view.settings.id }
}

/** set_reminder_time: applied now or proposed, as the guards decide for deps.actor. 400 outside 07:00–22:00 (quiet). */
export async function setReminderTime(
  deps: Deps,
  input: { kind: ClockReminder; time: string },
): Promise<SafeChangeResult<ReminderPrefs>> {
  if (input.time < REMINDER_HOURS.from || input.time >= REMINDER_HOURS.to)
    throw badRequest(`Reminders are quiet outside ${REMINDER_HOURS.from}–${REMINDER_HOURS.to}; pick a time in between (got ${input.time})`)
  return applySafeChange(deps, {
    change: { kind: 'reminder_time' },
    body: { kind: 'reminder_time', reminder: input.kind, time: input.time },
    summary: `${LABEL[input.kind]} reminder at ${input.time}`,
    apply: async () => (await saveTime(deps, input.kind, input.time)).reminders,
  })
}

/** Accepting a reminder_time proposal: save that time. */
export async function acceptReminderTime(deps: Deps, proposal: ProposalOf<'reminder_time'>): Promise<{ plan_version_id: null; applied: ProposalApplied }> {
  const saved = await saveTime(deps, proposal.body.reminder, proposal.body.time)
  return { plan_version_id: null, applied: { entity: 'settings', id: saved.settings_id } }
}
