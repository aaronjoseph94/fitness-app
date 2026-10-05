// Owns: reading and saving the reminder preferences (settings.reminders, merged over DEFAULT_REMINDER_PREFS so a kind
// added later still shows). A change is one PATCH /api/settings with the whole map, shown at once and rolled back if
// the Worker refuses. Not queued offline (settings writes need a connection).
import { endpoints } from '@fitness/shared/api'
import { DEFAULT_REMINDER_PREFS, type Reminder, type ReminderKind, type ReminderPrefs, type SettingsView } from '@fitness/shared/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { apiQueryKey, useApiMutation, useApiQuery } from '../../../api'

const SETTINGS_KEY = apiQueryKey(endpoints.settings.get, {})

export function useReminderPrefs() {
  const query = useApiQuery(endpoints.settings.get, {})
  const queryClient = useQueryClient()
  const mutation = useApiMutation(endpoints.settings.update, {
    invalidates: [endpoints.settings.get],
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY })
      const previous = queryClient.getQueryData<SettingsView>(SETTINGS_KEY)
      const reminders = input.body.settings?.reminders
      if (previous && reminders) queryClient.setQueryData<SettingsView>(SETTINGS_KEY, { ...previous, settings: { ...previous.settings, reminders } })
      return previous
    },
    onError: (_error, _input, previous) => {
      if (previous) queryClient.setQueryData(SETTINGS_KEY, previous as SettingsView)
    },
    onSuccess: (outcome) => {
      if (outcome.status === 'saved') queryClient.setQueryData(SETTINGS_KEY, outcome.data)
    },
  })
  const prefs: ReminderPrefs | undefined = query.data && { ...DEFAULT_REMINDER_PREFS, ...query.data.settings.reminders }
  return {
    query,
    prefs,
    fastHours: query.data?.settings.fast_hours,
    scanIntervalDays: query.data?.settings.scan_interval_days,
    saving: mutation.isPending,
    /** Save one kind's setting; resolves when stored, rejects (ApiError) otherwise. */
    save: (kind: ReminderKind, next: Reminder) => {
      if (!prefs) return Promise.reject(new Error('Settings are not loaded yet'))
      return mutation.mutateAsync({ body: { settings: { reminders: { ...prefs, [kind]: next } } } })
    },
  }
}
