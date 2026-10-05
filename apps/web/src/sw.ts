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
// Add here: a 'push' listener that shows the notification from the JSON payload (title, body, url, tag), and a
// 'notificationclick' listener that focuses an open window on payload.url or opens one. Subscription is page-side
// (POST /api/push/subscribe with the VAPID public key).
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
