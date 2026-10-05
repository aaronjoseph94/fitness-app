// Owns: running non-urgent work (the offline copy of a response, the startup queue replay and cache prune) when the
// page is idle, so it never competes with rendering what is on screen. Safari has no requestIdleCallback: a short
// timeout stands in.

/** Longest wait for an idle moment before the work runs anyway. */
const IDLE_TIMEOUT_MS = 2_000
/** Without requestIdleCallback (Safari): after the current rendering work. */
const FALLBACK_DELAY_MS = 300

export function whenIdle(work: () => void): void {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => work(), { timeout: IDLE_TIMEOUT_MS })
  } else {
    setTimeout(work, FALLBACK_DELAY_MS)
  }
}
