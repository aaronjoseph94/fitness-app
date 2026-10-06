// Owns: registering the service worker and the update policy — when an open page looks for a new deploy, and what happens
// when it finds one. The worker skips waiting and claims clients, so a new deploy takes charge at once; the page then
// offers a reload in the shell's banner (a page in front of the viewer is never reloaded under them) and reloads itself
// when it is in the background. Checks run on a timer and on return, not only when the tab comes back: a browser re-fetches
// a worker script by itself at most once every 24 hours, which is long enough to keep serving yesterday's build to a
// desktop tab that is never hidden. Hand-rolled instead of `virtual:pwa-register`, which needs `workbox-window` (not a
// dependency of @fitness/web).
import { useSyncExternalStore } from 'react'

/** How often an open page looks for a new deploy, in the foreground or not (four small requests an hour). */
const UPDATE_CHECK_MS = 15 * 60 * 1000
/** Registration has just fetched sw.js; the first extra check waits, so a launch costs one fetch of it rather than two. */
const FIRST_CHECK_MS = 5 * 1000
/** Returning to the foreground re-checks, but switching windows must not become one request per switch. */
const RETURN_CHECK_MS = 60 * 1000

const UPDATE_READY_EVENT = 'update-ready'
let updateReady = false
let lastCheckAt = 0

export function registerServiceWorker(): void {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return
  const container = navigator.serviceWorker
  const hadController = container.controller !== null

  container.addEventListener('controllerchange', () => {
    // The first install fires this too (clients.claim), and unregistering fires it with no controller: only a replaced
    // worker means a deployed build has taken charge of this page.
    if (!hadController || container.controller === null) return
    if (document.visibilityState === 'hidden') {
      window.location.reload()
      return
    }
    markUpdateReady()
  })

  window.addEventListener('load', () => {
    container
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then((registration) => {
        setTimeout(() => checkForUpdate(registration), FIRST_CHECK_MS)
        setInterval(() => checkForUpdate(registration), UPDATE_CHECK_MS)
        for (const event of ['focus', 'pageshow', 'online'] as const) {
          window.addEventListener(event, () => checkForUpdate(registration, RETURN_CHECK_MS))
        }
      })
      .catch((error: unknown) => console.warn('[pwa] service worker registration failed', error))
  })
}

/**
 * Ask the browser to re-fetch sw.js. Swallows its own failures: offline is not an app error, and the next check retries.
 * `registration` is optional because `register()` is typed as always resolving while a blocked or stubbed service worker
 * (Playwright's `serviceWorkers: 'block'`, a browser with the feature switched off) resolves with nothing — reading
 * `.update()` of that crashed the page on the first timer tick.
 */
function checkForUpdate(registration: ServiceWorkerRegistration | undefined, minGapMs = 0): void {
  const now = Date.now()
  if (now - lastCheckAt < minGapMs) return
  lastCheckAt = now
  registration?.update().catch(() => undefined)
}

function markUpdateReady(): void {
  if (updateReady) return
  updateReady = true
  window.dispatchEvent(new Event(UPDATE_READY_EVENT))
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(UPDATE_READY_EVENT, onChange)
  return () => window.removeEventListener(UPDATE_READY_EVENT, onChange)
}

/** True once a new deploy has taken charge of this page and only a reload is left. */
export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => updateReady,
    () => false,
  )
}

/** Take the new build. A plain reload is enough: the worker that took charge already holds the new app shell. */
export function reloadForUpdate(): void {
  window.location.reload()
}
