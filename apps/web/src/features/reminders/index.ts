// Owns: the reminders feature (SPEC §8 "Reminders", Web Push). Entry points:
// - RemindersPage (/settings/reminders): "Enable notifications" on this device (iOS: Home Screen app only), a test
//   notification, and each reminder kind on/off with its time (saved in settings.reminders).
// - useRestTimerNotifier(): the session page's rest timer calls it when a rest ends; it notifies only while the app
//   is in the background and the rest_timer reminder is on.
export { RemindersPage } from './lib/RemindersPage'
export { useRestTimerNotifier } from './lib/useRestTimerNotifier'
