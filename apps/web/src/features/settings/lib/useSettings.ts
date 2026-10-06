// Owns: reading and changing settings — GET /api/settings, and PATCH /api/settings applied optimistically (the screen
// shows the new value at once and rolls back if the Worker refuses), then the day, plan and settings refetch. The same
// call edits the profile, so `saveProfile` is the profile half of one PATCH.
// Settings writes are not queued offline (endpoints.settings.update has no offline flag), so they need a connection.
import { endpoints } from '@fitness/shared/api'
import type { ProfilePatch, Settings, SettingsView } from '@fitness/shared/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { apiQueryKey, useApiMutation, useApiQuery } from '../../../api'

const SETTINGS_KEY = apiQueryKey(endpoints.settings.get, {})

export type SettingsChange = Partial<Omit<Settings, 'id' | 'created_at' | 'updated_at'>>
/** One profile field (or a few) as PATCH /api/settings takes it (`profile`). */
export type ProfileChange = ProfilePatch

export function useSettings() {
  return useApiQuery(endpoints.settings.get, {})
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  const mutation = useApiMutation(endpoints.settings.update, {
    invalidates: [endpoints.settings.get, endpoints.day.get, endpoints.day.range, endpoints.plan.get],
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY })
      const previous = queryClient.getQueryData<SettingsView>(SETTINGS_KEY)
      if (previous) {
        queryClient.setQueryData<SettingsView>(SETTINGS_KEY, {
          profile: input.body.profile ? { ...previous.profile, ...input.body.profile } : previous.profile,
          settings: input.body.settings ? { ...previous.settings, ...input.body.settings } : previous.settings,
        })
      }
      return previous
    },
    onError: (_error, _input, previous) => {
      if (previous) queryClient.setQueryData(SETTINGS_KEY, previous as SettingsView)
    },
    onSuccess: (outcome) => {
      if (outcome.status === 'saved') queryClient.setQueryData(SETTINGS_KEY, outcome.data)
    },
  })
  return {
    ...mutation,
    /** Save a settings change; resolves when the Worker stored it, rejects (ApiError) otherwise. */
    save: (change: SettingsChange) => mutation.mutateAsync({ body: { settings: change } }),
    /** Save a profile change through the same PATCH, with the same optimistic write and rollback. */
    saveProfile: (change: ProfileChange) => mutation.mutateAsync({ body: { profile: change } }),
  }
}
