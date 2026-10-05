// Owns: Web Push subscriptions, the reminder preferences (kinds, times, on/off) from SPEC §8 "Reminders" with their
// defaults and quiet hours, and the notification payload the Worker sends and the service worker shows.
import * as z from 'zod'
import { Count, LocalTime, Row } from './common'

export const ReminderKind = z.enum(['weigh_in', 'water', 'workout', 'fast', 'scan_due', 'review_ready', 'rest_timer'])
export type ReminderKind = z.infer<typeof ReminderKind>

/** One reminder: on/off and, for clock reminders (weigh-in 07:00, workout 16:30, scan due), the Edmonton time. */
export const Reminder = z.object({ enabled: z.boolean(), time: LocalTime.nullable() })
export type Reminder = z.infer<typeof Reminder>

/** Every reminder kind with its setting (exhaustive). Stored with the settings; not a rail. */
export const ReminderPrefs = z.record(ReminderKind, Reminder)
export type ReminderPrefs = z.infer<typeof ReminderPrefs>

/**
 * Reminders are sent only from 07:00 (inclusive) to 22:00 (exclusive), Edmonton time; outside that is quiet. The same
 * window is the "waking day" the water pace is measured against.
 */
export const REMINDER_HOURS = { from: '07:00', to: '22:00' } as const satisfies Record<'from' | 'to', LocalTime>

/** Kinds that fire at a time of day Aaron picks (the rest follow events: pace, planned fasts, reviews, the timer). */
export const CLOCK_REMINDERS = ['weigh_in', 'workout', 'scan_due'] as const satisfies readonly ReminderKind[]

/**
 * SPEC §8 defaults: weigh-in 07:00, water when behind pace, workout 16:30 on training days, fast start/end, scan due
 * (09:00 on the due date), weekly review ready, rest timer end. All on.
 */
export const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
  weigh_in: { enabled: true, time: '07:00' },
  water: { enabled: true, time: null },
  workout: { enabled: true, time: '16:30' },
  fast: { enabled: true, time: null },
  scan_due: { enabled: true, time: '09:00' },
  review_ready: { enabled: true, time: null },
  rest_timer: { enabled: true, time: null },
}

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

/** Body of DELETE /api/push/subscribe: forget this device's subscription (no-op when unknown). */
export const PushUnsubscribe = z.object({ endpoint: z.url() })
export type PushUnsubscribe = z.infer<typeof PushUnsubscribe>

/** Response of GET /api/push/key: the VAPID public key (base64url) to subscribe with; null when push isn't configured. */
export const PushKey = z.object({ public_key: z.string().min(1).nullable() })
export type PushKey = z.infer<typeof PushKey>

/** Body of POST /api/push/test: one device (its endpoint), or every subscribed device when omitted. */
export const PushTest = z.object({ endpoint: z.url().optional() })
export type PushTest = z.infer<typeof PushTest>

/**
 * What one send did: `configured` false when the VAPID keys are missing (nothing sent); `removed` counts subscriptions
 * dropped because the push service said they are gone (404/410).
 */
export const PushResult = z.object({ configured: z.boolean(), sent: Count, failed: Count, removed: Count })
export type PushResult = z.infer<typeof PushResult>

/** The JSON payload of one push: the service worker shows it (title, body, tag) and opens `url` on a tap. */
export const PushNotification = z.object({
  title: z.string().min(1).max(80),
  body: z.string().max(300),
  /** In-app path opened on tap, e.g. '/', '/train', '/reports/week/2026-W41'. */
  url: z.string().startsWith('/'),
  /** Replaces an earlier notification with the same tag (one per kind). */
  tag: z.string().min(1).max(64),
})
export type PushNotification = z.infer<typeof PushNotification>
