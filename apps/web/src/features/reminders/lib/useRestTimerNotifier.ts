// Owns: the rest-timer reminder, which is device-side (a 5-minute cron can't time a 90 s rest): a function the session
// page calls when a rest ends. It shows a notification only when the app is in the background, notifications are
// allowed here and the rest_timer reminder is on; otherwise the page's own timer UI is enough. (iOS pauses a
// backgrounded web app's timers, so there it fires when the app wakes.)
import { endpoints } from '@fitness/shared/api'
import { useCallback } from 'react'
import { useApiQuery } from '../../../api'
import { showLocalNotification } from './push-client'

export function useRestTimerNotifier(): (next?: { exercise?: string; url?: string }) => void {
  const settings = useApiQuery(endpoints.settings.get, {})
  const enabled = settings.data?.settings.reminders.rest_timer?.enabled ?? true
  return useCallback(
    (next = {}) => {
      if (!enabled || document.visibilityState === 'visible') return
      void showLocalNotification('Rest over', {
        body: next.exercise ? `Next set: ${next.exercise}.` : 'Time for the next set.',
        tag: 'rest_timer',
        url: next.url ?? window.location.pathname,
      }).catch(() => undefined)
    },
    [enabled],
  )
}
