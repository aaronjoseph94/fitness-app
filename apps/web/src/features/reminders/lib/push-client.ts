// Owns: this device's side of Web Push — whether it can receive pushes here (iOS only in the Home Screen app), the
// notification permission, the PushManager subscription (made with the Worker's VAPID public key, remade when the key
// changed), and keeping the Worker's copy in step (POST/DELETE /api/push/subscribe).
import { endpoints } from '@fitness/shared/api'
import { ReminderKind } from '@fitness/shared/schemas'
import { call } from '../../../api'

/**
 * 'ready': can subscribe here. 'needs-install': iPhone/iPad Safari outside the Home Screen app (iOS allows web push
 * only for installed apps). 'no-worker': no service worker controls this page (a dev build). 'unsupported': no Push API.
 */
export type PushSupport = 'ready' | 'needs-install' | 'no-worker' | 'unsupported'

export function isIos(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export async function pushSupport(): Promise<PushSupport> {
  const api = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (isIos() && !isStandalone()) return 'needs-install'
  if (!api) return 'unsupported'
  return (await navigator.serviceWorker.getRegistration()) ? 'ready' : 'no-worker'
}

export function permission(): NotificationPermission | 'unsupported' {
  return 'Notification' in window ? Notification.permission : 'unsupported'
}

/** This device's push subscription, if any (null without a service worker). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker?.getRegistration()
  return (await registration?.pushManager.getSubscription()) ?? null
}

/** base64url → bytes (the VAPID key format). */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

function sameKey(subscription: PushSubscription, publicKey: string): boolean {
  const current = subscription.options.applicationServerKey
  if (!current) return false
  const a = new Uint8Array(current)
  const b = keyBytes(publicKey)
  return a.length === b.length && a.every((v, i) => v === b[i])
}

/** Tell the Worker about this subscription (upsert by endpoint); every kind — the reminder settings decide. */
async function register(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('The browser returned an incomplete subscription')
  await call(endpoints.push.subscribe, {
    body: { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }, kinds: ReminderKind.options },
  })
}

/**
 * "Enable notifications". Call it straight from the tap: iOS shows the permission prompt only inside a user gesture,
 * so the permission request is the first thing that happens. Resolves with the permission; when granted, this device
 * is subscribed with `publicKey` (a subscription made with an older key is replaced) and stored on the Worker.
 */
export async function enablePush(publicKey: string): Promise<NotificationPermission> {
  const granted = await Notification.requestPermission()
  if (granted !== 'granted') return granted
  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (subscription && !sameKey(subscription, publicKey)) {
    await subscription.unsubscribe()
    subscription = null
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })
  await register(subscription)
  return granted
}

/** "Turn off on this device": forget it on the Worker, then unsubscribe the browser. */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription()
  if (!subscription) return
  await call(endpoints.push.unsubscribe, { body: { endpoint: subscription.endpoint } })
  await subscription.unsubscribe()
}

/**
 * Keep the Worker's copy current (after a restore, a key change, or a browser-rotated endpoint): when permission is
 * granted, re-subscribe if the key changed, then upsert. Returns whether this device is subscribed. Safe to call often.
 */
export async function syncPush(publicKey: string | null): Promise<boolean> {
  if (!publicKey || permission() !== 'granted') return (await currentSubscription()) !== null
  const subscription = await currentSubscription()
  if (!subscription) return false
  if (!sameKey(subscription, publicKey)) {
    await enablePush(publicKey)
    return true
  }
  await register(subscription)
  return true
}

/** Show a notification from the page (through the service worker, as iOS requires). False when not allowed here. */
export async function showLocalNotification(title: string, options: { body: string; tag: string; url: string }): Promise<boolean> {
  if (permission() !== 'granted') return false
  const registration = await navigator.serviceWorker?.getRegistration()
  if (!registration) return false
  await registration.showNotification(title, { body: options.body, tag: options.tag, data: { url: options.url }, icon: '/icons/icon-192.png' })
  return true
}
