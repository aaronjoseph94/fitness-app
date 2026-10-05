/// <reference lib="webworker" />
// Owns: the service worker — the precached app shell (offline launch), navigation fallback to index.html, runtime image
// caches, and (phase 5) Web Push. No Background Sync: iOS lacks it, so the page flushes the offline queue itself.
import { clientsClaim, type WorkboxPlugin } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { NETWORK_ONLY_NAVIGATIONS } from './offline/network-only'

declare const self: ServiceWorkerGlobalScope

// registerType 'autoUpdate': a new deploy takes over at once and the page reloads itself (virtual:pwa-register).
void self.skipWaiting()
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Every in-app navigation gets the cached shell, so the app opens offline. API, MCP, Access, OAuth and PDF paths do not.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: NETWORK_ONLY_NAVIGATIONS }))

const DAY_SECONDS = 24 * 60 * 60

/** Store only real images: an Access login page or the SPA fallback must never be cached as a picture. */
const imagesOnly: WorkboxPlugin = {
  cacheWillUpdate: async ({ response }) =>
    response.status === 200 && (response.headers.get('content-type') ?? '').startsWith('image/') ? response : null,
}

const isSameOrigin = (url: URL) => url.origin === self.location.origin

// Exercise step images and demo GIFs: immutable once fetched, ~1,750 + ~400 files.
registerRoute(
  ({ url }) => isSameOrigin(url) && (url.pathname.startsWith('/exercises/') || url.pathname.startsWith('/media/')),
  new CacheFirst({
    cacheName: 'exercise-media',
    plugins: [imagesOnly, new ExpirationPlugin({ maxEntries: 2000, maxAgeSeconds: 60 * DAY_SECONDS, purgeOnQuotaError: true })],
  }),
)

// Illustrations not in the precache (empty states and the like): show the cached copy, refresh in the background.
registerRoute(
  ({ url }) => isSameOrigin(url) && url.pathname.startsWith('/illustrations/'),
  new StaleWhileRevalidate({
    cacheName: 'illustrations',
    plugins: [imagesOnly, new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * DAY_SECONDS, purgeOnQuotaError: true })],
  }),
)

// ─── Phase 5: Web Push (SPEC §8 Reminders) ───────────────────────────────────────────────────────────────────────────
// 'push' shows the notification from the JSON payload the Worker sends (PushNotification: title, body, url, tag);
// every push must show one (Safari revokes a subscription whose pushes stay silent). 'notificationclick' focuses an
// open window (navigating it to payload.url when it is elsewhere) or opens one. Subscribing is page-side
// (features/reminders: GET /api/push/key, PushManager.subscribe, POST /api/push/subscribe).

/** The payload contract shared with the Worker (type only: no Zod in the service worker bundle). */
type PushNotification = import('@fitness/shared/schemas').PushNotification

/** The payload, read defensively: a malformed push still shows something and opens the app. */
function readPush(data: PushMessageData | null): PushNotification {
  const fallback: PushNotification = { title: 'Fitness', body: '', url: '/', tag: 'fitness' }
  if (!data) return fallback
  try {
    const p = data.json() as Partial<Record<keyof PushNotification, unknown>>
    const text = (v: unknown, or: string) => (typeof v === 'string' && v.length > 0 ? v : or)
    return { title: text(p.title, fallback.title), body: text(p.body, ''), url: inAppPath(p.url), tag: text(p.tag, fallback.tag) }
  } catch {
    return { ...fallback, body: data.text() }
  }
}

/** Only same-origin in-app paths ('/…', never '//host'); anything else opens Today. */
function inAppPath(url: unknown): string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/'
}

self.addEventListener('push', (event) => {
  const n = readPush(event.data)
  event.waitUntil(
    self.registration.showNotification(n.title, {
      body: n.body,
      tag: n.tag,
      data: { url: n.url },
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(inAppPath((event.notification.data as { url?: unknown } | null)?.url), self.location.origin)
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((w) => new URL(w.url).origin === target.origin)
      if (!open) {
        await self.clients.openWindow(target.href)
        return
      }
      const focused = await open.focus()
      if (new URL(focused.url).pathname + new URL(focused.url).search !== target.pathname + target.search)
        await focused.navigate(target.href).catch(() => undefined)
    })(),
  )
})
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
