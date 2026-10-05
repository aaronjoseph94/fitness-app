// Owns: how each reminder kind reads on the Reminders page — its label, when it fires (in Aaron's words), and
// whether it has a time to pick. The rules themselves live in the Worker (modules/reminders).
import { CLOCK_REMINDERS, REMINDER_HOURS, type ReminderKind } from '@fitness/shared/schemas'

export interface KindCopy {
  kind: ReminderKind
  label: string
  help: (ctx: { fastHours: number; scanIntervalDays: number }) => string
}

export const KINDS: readonly KindCopy[] = [
  { kind: 'weigh_in', label: 'Weigh-in', help: () => 'Every morning at this time, unless today’s weigh-in is logged.' },
  {
    kind: 'water',
    label: 'Water',
    help: () => 'Every 2 h from 09:00 to 21:00 (every 90 min on a fast day), only when you’re behind pace for the day.',
  },
  { kind: 'workout', label: 'Workout', help: () => 'On training days at this time, unless a session is already logged.' },
  { kind: 'fast', label: 'Fast start and end', help: ({ fastHours }) => `When a planned fast starts, and when it reaches ${fastHours} h.` },
  {
    kind: 'scan_due',
    label: 'Scan due',
    help: ({ scanIntervalDays }) => `On the due date (every ${scanIntervalDays} days) at this time, then weekly while overdue.`,
  },
  { kind: 'review_ready', label: 'Weekly review ready', help: () => 'When the week’s review is written, from Sunday evening.' },
  { kind: 'rest_timer', label: 'Rest timer', help: () => 'When a rest ends while the app is in the background on this device.' },
]

export const hasTime = (kind: ReminderKind): boolean => (CLOCK_REMINDERS as readonly ReminderKind[]).includes(kind)

/** The latest time a clock reminder still goes out: the Worker checks every 5 minutes and is quiet from 22:00. */
export const LATEST_TIME = '21:55'
export const EARLIEST_TIME = REMINDER_HOURS.from

export const inWakingHours = (time: string) => time >= EARLIEST_TIME && time <= LATEST_TIME
