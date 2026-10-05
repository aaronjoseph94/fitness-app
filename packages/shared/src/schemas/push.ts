// Owns: Web Push subscriptions and the reminder preferences (kinds, times, on/off) from SPEC §8 "Reminders".
import * as z from 'zod'
import { LocalTime, Row } from './common'

export const ReminderKind = z.enum(['weigh_in', 'water', 'workout', 'fast', 'scan_due', 'review_ready', 'rest_timer'])
export type ReminderKind = z.infer<typeof ReminderKind>

/** One reminder: on/off and, for clock reminders (weigh-in 07:00, workout 16:30), the Edmonton time. */
export const Reminder = z.object({ enabled: z.boolean(), time: LocalTime.nullable() })
export type Reminder = z.infer<typeof Reminder>

/** Every reminder kind with its setting (exhaustive). Stored with the settings; not a rail. */
export const ReminderPrefs = z.record(ReminderKind, Reminder)
export type ReminderPrefs = z.infer<typeof ReminderPrefs>

/** Body of POST /api/push/subscribe — the browser PushSubscription JSON plus the kinds it wants. Upserts by endpoint. */
export const PushSubscribe = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  kinds: z.array(ReminderKind),
})
export type PushSubscribe = z.infer<typeof PushSubscribe>

/** A stored subscription as the API returns it (keys stay server-side). */
export const PushSubscription = Row.extend({ endpoint: z.url(), kinds: z.array(ReminderKind) })
export type PushSubscription = z.infer<typeof PushSubscription>
