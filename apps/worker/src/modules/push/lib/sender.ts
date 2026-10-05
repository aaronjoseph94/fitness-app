// Owns: the push adapter seam — delivering one notification to one browser subscription — and the real adapter: Web
// Push (RFC 8291 aes128gcm + RFC 8292 VAPID) through @block65/webcrypto-web-push and fetch. Encryption is a handful of
// native WebCrypto calls per message (no CPU-heavy work in the Worker).
import type { PushNotification } from '@fitness/shared/schemas'
import { buildPushPayload, type VapidKeys } from '@block65/webcrypto-web-push'
import type { Env } from '../../../env'

/** Where a push goes: the browser's PushSubscription endpoint and its encryption keys. */
export interface PushTarget {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** Delivery hints for the push service: time to live, urgency and a topic (a newer push with it replaces an undelivered one). */
export interface PushDelivery {
  ttl_s: number
  urgency: 'low' | 'normal' | 'high'
  /** ≤ 32 base64url characters. */
  topic?: string
}

/**
 * Adapter: deliver one notification; resolves with the push service's HTTP status (201 = accepted, 404/410 = the
 * subscription is gone). Rejects only on a network failure or timeout.
 */
export type PushSender = (target: PushTarget, notification: PushNotification, delivery: PushDelivery) => Promise<number>

/** One push service call may take this long before it counts as failed. */
const SEND_TIMEOUT_MS = 10_000

/** The VAPID keys from the Worker secrets, or null when any of the three is missing (push not configured). */
export function vapidKeys(env: Env): VapidKeys | null {
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = env
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null
}

/** The real adapter for these VAPID keys. */
export function webPushSender(vapid: VapidKeys): PushSender {
  return async (target, notification, delivery) => {
    const payload = await buildPushPayload(
      {
        data: notification,
        options: { ttl: delivery.ttl_s, urgency: delivery.urgency, ...(delivery.topic ? { topic: delivery.topic } : {}) },
      },
      { endpoint: target.endpoint, expirationTime: null, keys: target.keys },
      vapid,
    )
    const res = await fetch(target.endpoint, { ...payload, signal: AbortSignal.timeout(SEND_TIMEOUT_MS) })
    // Drain the (small) body so the connection is released.
    await res.body?.cancel().catch(() => undefined)
    return res.status
  }
}
