// Owns: the Dashboard's "is the first load still in flight?" decision, which is the one thing that separates its
// skeleton from its error card. Both of the page's essentials (the day rows and the trend) have to be read the same
// way, because "has no data" is not the same question as "still loading": a read that has stopped with nothing to
// show — a failure, or a read paused offline that this phone has never saved — also has no data, and that is exactly
// when the error card (the only place "Sign in again" and "Try again" live) has to be shown instead of a skeleton.
import { describe, expect, it } from 'vitest'
import { essentialsLoading, type EssentialRead } from './essential-reads'

/** A read that has stopped: it answered, it failed, or the network paused it. */
const settled = (fetchStatus: EssentialRead['fetchStatus'] = 'idle'): EssentialRead => ({ isPending: false, fetchStatus })
/** A read whose first load is still in flight. */
const inFlight: EssentialRead = { isPending: true, fetchStatus: 'fetching' }
/** A read the network failure paused with nothing saved on this phone (TanStack holds the retry until it is online). */
const pausedOffline: EssentialRead = settled('paused')
/** A read that failed: auth expired, a 5xx, or a request that never reached the Worker with no cached answer. */
const failed = settled()

describe('essentialsLoading', () => {
  it('is true while an essential read is still in flight', () => {
    expect(essentialsLoading(inFlight, inFlight)).toBe(true)
    expect(essentialsLoading(settled(), inFlight)).toBe(true)
  })

  it('is false once both essentials have stopped', () => {
    expect(essentialsLoading(settled(), settled())).toBe(false)
  })

  // The bug: the hook reported `loading` whenever an essential had no data, so this was true and the page's skeleton
  // hid its error card for good — an offline first visit was an endless skeleton with no way back on.
  it('is false for a read the network paused with nothing saved on this phone', () => {
    expect(essentialsLoading(pausedOffline, pausedOffline)).toBe(false)
    expect(essentialsLoading(settled(), pausedOffline)).toBe(false)
  })

  it('is false for a read that failed with nothing cached, so the error card can be shown', () => {
    expect(essentialsLoading(failed, failed)).toBe(false)
    expect(essentialsLoading(failed, settled())).toBe(false)
  })
})
