// Owns: registering the service worker and the auto-update policy. The worker skips waiting and claims clients, so a new
// deploy takes control at once; the page then reloads the next time it is in the background (never mid-entry), and
// checks for a new deploy whenever it returns to the foreground, at most hourly (iOS keeps PWAs open for days).
// Hand-rolled instead of `virtual:pwa-register`, which needs `workbox-window` (not a dependency of @fitness/web).

const UPDATE_CHECK_MS = 60 * 60 * 1000

export function registerServiceWorker(): void {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return
  const container = navigator.serviceWorker
  const hadController = container.controller !== null

  container.addEventListener('controllerchange', () => {
    // The first install also fires this (clients.claim); only a replaced worker means a new build.
    if (hadController) reloadWhenHidden()
  })

  window.addEventListener('load', () => {
    container
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then(checkForUpdatesOnReturn)
      .catch((error: unknown) => console.warn('[pwa] service worker registration failed', error))
  })
}

function checkForUpdatesOnReturn(registration: ServiceWorkerRegistration): void {
  let lastCheck = Date.now()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - lastCheck < UPDATE_CHECK_MS) return
    lastCheck = Date.now()
    registration.update().catch(() => undefined)
  })
}

let reloadScheduled = false

function reloadWhenHidden(): void {
  if (reloadScheduled) return
  reloadScheduled = true
  if (document.visibilityState === 'hidden') {
    window.location.reload()
    return
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') window.location.reload()
  })
}
