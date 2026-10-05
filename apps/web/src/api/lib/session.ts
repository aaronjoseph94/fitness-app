// Owns: the Cloudflare Access session signal — raised by the transport on a redirect, read by the shell's banner — and the
// "Sign in again" round trip through Access that bypasses the service worker's cached shell.
import { useSyncExternalStore } from 'react'
import { SIGN_IN_PARAM } from '../../offline/network-only'

const AUTH_EXPIRED_EVENT = 'auth-expired'
let expired = false

/** Raise once per page life; only a reload (through Access) clears it. Dispatched on `window` as 'auth-expired'. */
export function markAuthExpired(): void {
  if (expired) return
  expired = true
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(AUTH_EXPIRED_EVENT, onChange)
  return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onChange)
}

export function useAuthExpired(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => expired,
    () => false,
  )
}

/** Reload the current page through Access. The marker makes the service worker let this navigation reach the network. */
export function signInAgain(): void {
  const url = new URL(window.location.href)
  url.searchParams.set(SIGN_IN_PARAM, '1')
  window.location.assign(url)
}

/** Drop the marker after the round trip so later reloads use the offline shell again. Call before the router starts. */
export function clearSignInMarker(): void {
  const url = new URL(window.location.href)
  if (!url.searchParams.has(SIGN_IN_PARAM)) return
  url.searchParams.delete(SIGN_IN_PARAM)
  window.history.replaceState(window.history.state, '', url)
}
