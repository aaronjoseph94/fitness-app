// Owns: the "logged" notice the logging forms share (saved vs on this phone). Error wording lives in the api module
// (problemText); the number field and the "couldn't load" row live in components.

/** What a form reports after a write, for the sheet's snackbar. */
export interface LogNotice {
  message: string
  /** Kept on this phone; it syncs when the Worker is reachable. */
  queued: boolean
}

export function noticeFor(outcome: { status: 'saved' | 'queued' }, message: string): LogNotice {
  return outcome.status === 'queued'
    ? { message: `${message} · saved on this phone, syncs when you're back online`, queued: true }
    : { message, queued: false }
}
