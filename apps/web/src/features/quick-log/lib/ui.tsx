// Owns: the "logged" notice the logging forms share (saved vs on this device), the sheet's sticky action row (the
// primary button stays in view above the keyboard, UX #31; each one carries `data-sheet-actions`), and where a notice
// shown over an open sheet sits so it never covers that row. Error wording lives in the api module (problemText); the
// number field and the "couldn't load" row live in components.
import { useLayoutEffect, useState } from 'react'
import { tokens } from '../../../theme'

/** The sheet body's bottom padding, px (LogSheet's scroll area). */
export const SHEET_BODY_PB = 8

/**
 * A form's action row pinned to the bottom of the sheet's scroll area: an opaque card-white strip, pulled down over the
 * area's bottom padding (bottom = −padding) so nothing scrolled behind it shows underneath.
 */
export const stickyActionsSx = {
  position: 'sticky',
  bottom: -SHEET_BODY_PB,
  zIndex: 1,
  display: 'grid',
  gap: 2,
  pt: 2,
  pb: `${SHEET_BODY_PB}px`,
  bgcolor: tokens.ink.card,
} as const

/** What a form reports after a write, for the sheet's snackbar. */
export interface LogNotice {
  message: string
  /** Kept on this device; it syncs when the Worker is reachable. */
  queued: boolean
}

export function noticeFor(outcome: { status: 'saved' | 'queued' }, message: string): LogNotice {
  return outcome.status === 'queued'
    ? { message: `${message} · saved on this device, syncs when you're back online`, queued: true }
    : { message, queued: false }
}

/** The gap, px, between a lifted notice and what it clears. */
const NOTICE_GAP = 8
/** The room a one-line notice needs under the action row: its 48 px and a gap either side. */
const NOTICE_ROOM = 48 + 2 * NOTICE_GAP

/**
 * How far above the viewport's bottom edge a snackbar must sit to clear an open sheet's sticky action row (the
 * `data-sheet-actions` row inside `scrollArea`), or, for a sheet without one, the sheet itself:
 * clearance = innerHeight − top of that row (or of the sheet) + 8 px, or just 8 px when the row ends 64 px or more
 * above the bottom edge (the notice fits under it). Measured again when the sheet or the window
 * resizes (the keyboard), its content changes (a stage swap) or it scrolls. null while `active` is false or nothing is
 * mounted: the theme's bottom applies.
 */
export function useNoticeClearance(scrollArea: HTMLElement | null, active: boolean): number | null {
  const [clearance, setClearance] = useState<number | null>(null)
  useLayoutEffect(() => {
    const sheet = scrollArea?.parentElement
    if (!active || !scrollArea || !sheet) {
      setClearance(null)
      return
    }
    const measure = () => {
      const rows = [...scrollArea.querySelectorAll<HTMLElement>('[data-sheet-actions]')]
        .map((row) => row.getBoundingClientRect())
        .filter((rect) => rect.height > 0)
      const bottom = rows.length > 0 ? Math.max(...rows.map((rect) => rect.bottom)) : window.innerHeight
      // A short page leaves the row mid-screen (a full-screen dialog): the notice fits under it, clear of the content.
      if (window.innerHeight - bottom >= NOTICE_ROOM) return setClearance(NOTICE_GAP)
      const top =
        rows.length > 0 ? Math.min(...rows.map((rect) => rect.top)) : sheet.getBoundingClientRect().top
      setClearance(Math.max(0, window.innerHeight - top) + NOTICE_GAP)
    }
    // Once a frame at most: the sheet resizing, its content changing (a stage swap, data arriving), a scroll.
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    measure()
    const resized = new ResizeObserver(schedule)
    resized.observe(sheet)
    const changed = new MutationObserver(schedule)
    changed.observe(scrollArea, { childList: true, subtree: true })
    scrollArea.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      resized.disconnect()
      changed.disconnect()
      scrollArea.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [scrollArea, active])
  return clearance
}

/** The snackbar `sx` that lifts a notice by `clearance` px at every breakpoint (the theme sets one per breakpoint). */
export function clearanceSx(clearance: number | null) {
  if (clearance === null) return undefined
  const bottom = `${clearance}px`
  return { bottom: { xs: bottom, sm: bottom, md: bottom } }
}
