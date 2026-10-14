// Owns: the reminders feature (SPEC §8 "Reminders", Web Push). Entry points:
// - RemindersPage (/settings/reminders): "Enable notifications" on this device (iOS: Home Screen app only), a test
//   notification, and each reminder kind on/off with its time (saved in settings.reminders).
export { RemindersPage } from './lib/RemindersPage'
