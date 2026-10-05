// Owns: an ApiError in plain words — the one wording every screen shows for a failed read or write (never a stack of codes).
import { isApiError } from './errors'

/**
 * A failed write or read in plain words. `needsConnection` is the screen's own context, added only when the server
 * could not be reached (e.g. "Settings changes need a connection.").
 */
export function problemText(error: unknown, needsConnection?: string): string {
  if (!isApiError(error)) return 'Something went wrong. Try again.'
  switch (error.kind) {
    case 'network': {
      const text = navigator.onLine ? "Couldn't reach the server. Try again in a moment." : "You're offline."
      return needsConnection ? `${text} ${needsConnection}` : text
    }
    case 'auth-expired':
      return 'Your sign-in expired. Sign in again from the banner at the top.'
    case 'invalid-request':
      return `Check the values: ${error.message}.`
    case 'invalid-response':
      return 'The app and the server are out of step. Reload the app.'
    case 'http':
      if (error.transient) return 'The server is having a moment. Try again shortly.'
      if (error.status === 404) return "The server doesn't have that (yet)."
      return error.message || `The server said no (HTTP ${error.status ?? '?'}).`
  }
}
