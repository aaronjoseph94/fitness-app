// Owns: dragging a bottom sheet away. This is the one place in the app where motion is a *conversation* rather than a
// transition, so it is built the way Apple builds a sheet:
//
//   1:1         the sheet stays glued to the finger, with no transition smoothing the moves out (`transition: none`
//               on the paper while dragging, via the returned `dragging`) and no React state per frame — the transform
//               is written straight to the element, which is what keeps a drag at frame rate.
//   hysteresis  nothing engages until the pointer has travelled `ENGAGE_PX`, so a stray tap never nudges the sheet.
//   velocity    a short history of (position, time) samples, so the release hands the finger's own velocity to the
//               animation that follows. Without that hand-off there is a visible seam where the drag ends and the
//               spring begins — the detail that separates "fluid" from "fine".
//   projection  the resting place comes from where the flick was *going* (Apple's exponential-decay projection), not
//               from where the finger happened to let go, so a quick flick throws the sheet away.
//   boundary    dragging up past the sheet's top meets progressive resistance instead of stopping dead.
//   spring      the settle is the analytic spring in `motion/spring.ts`, sampled into keyframes for the browser's own
//               clock: no `requestAnimationFrame` loop of ours, and a frame that never arrives cannot strand the sheet
//               half-way down the screen.
//   interrupt   grab a sheet that is already moving and it follows the finger from where it *is* (the presentation
//               value, read off the element), with the running spring cancelled — never from the target it was
//               heading for, which would jump.
//
// Two constraints shape where this may be attached. It captures the pointer on **pointer-down**, because that is the
// only way a fast movement cannot escape the region between events — capture is what keeps the moves coming once the
// finger has left. And capture retargets the compatibility mouse events to the capturing element, which takes the
// `click` away from anything inside it. So the region it is attached to must be a **grabber strip containing no
// controls**: the sheet's title row, with its Back and Close buttons, stays outside it and keeps working normally.
//
// Reduced motion opts out entirely: the sheet is closed by its own controls, with no travel.
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../../theme'
import {
  projectMomentum,
  rubberband,
  springFrames,
  SPRING_DEFAULT,
  SPRING_MOMENTUM,
  velocityFrom,
} from '../../motion/spring'

/** How far the pointer must travel before a press becomes a drag (px). Below it nothing moves. */
const ENGAGE_PX = 10

/** How far the sheet's top edge can be pulled past its resting place before resistance takes over (px). */
const TOP_HEADROOM = 320

/** A release faster than this (px/s) is a flick, whatever the distance: its *direction* decides, not the position. */
const FLICK_VELOCITY = 400

/** Above this the release counts as momentum-carrying, so the settle may overshoot the way a thrown object does. */
const MOMENTUM_VELOCITY = 200

export interface SheetDragHandleProps {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
}

export interface SheetDragOptions {
  /** Close the sheet. Called once it has actually left the screen, never mid-flight. */
  onDismiss: () => void
  /** How far a *slow* drag must project before letting go dismisses it (px). A flick decides on its own. */
  dismissDistance?: number
}

export interface SheetDrag {
  /**
   * Spread onto the grabber strip — which must hold no controls: see the note above about pointer capture and clicks.
   */
  handleProps: SheetDragHandleProps
  /**
   * Spread into that strip's `sx`. Without `touch-action: none` the browser pans the sheet body instead of letting
   * the gesture own the pointer, and the drag never starts.
   */
  handleSx: { touchAction: 'none' }
  /** True from the instant a drag engages until it settles: the paper drops its transition while it is. */
  dragging: boolean
}

interface Gesture {
  pointerId: number
  /** Pointer position that corresponds to `base` (px). */
  anchorY: number
  /** Where the sheet sat, in px below its resting place, at `anchorY`. */
  base: number
  samples: { position: number; time: number }[]
  /** False until the pointer has travelled `ENGAGE_PX`; a tap never becomes a drag. */
  active: boolean
  paper: HTMLElement | null
}

const IDLE: Gesture = { pointerId: -1, anchorY: 0, base: 0, samples: [], active: false, paper: null }

/**
 * Where the sheet actually *is* on screen, in px below its resting place — the presentation value, which is what an
 * interrupted animation has to resume from. Read off the rendered transform rather than remembered, because during a
 * settle the two differ.
 */
function presentationOffset(element: HTMLElement): number {
  const transform = getComputedStyle(element).transform
  if (!transform || transform === 'none') return 0
  try {
    return new DOMMatrixReadOnly(transform).m42
  } catch {
    // A transform the engine will not parse is one we cannot resume from; the resting place is the safe answer.
    return 0
  }
}

export function useSheetDrag({ onDismiss, dismissDistance = 96 }: SheetDragOptions): SheetDrag {
  const [dragging, setDragging] = useState(false)
  const gesture = useRef<Gesture>(IDLE)
  /** The settle in flight, if any, so a new grab can take the sheet over from it. */
  const settle = useRef<Animation | null>(null)
  const dismissRef = useRef(onDismiss)
  useEffect(() => {
    dismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    // A gesture still in flight when this unmounts must not leave the paper transformed or a spring running.
    return () => {
      settle.current?.cancel()
      gesture.current.paper?.style.removeProperty('transform')
      gesture.current = IDLE
    }
  }, [])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (prefersReducedMotion()) return
    // A secondary mouse button is never a drag, and a right-drag would open the context menu over the sheet.
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const paper = event.currentTarget.parentElement
    if (!paper) return
    gesture.current = {
      pointerId: event.pointerId,
      anchorY: event.clientY,
      base: presentationOffset(paper),
      samples: [{ position: event.clientY, time: event.timeStamp }],
      active: false,
      paper,
    }
    // Captured straight away so a single fast movement cannot carry the pointer out of this strip and lose the
    // gesture. Nothing is cancelled yet: a tap that never becomes a drag must leave a sheet that is already settling
    // alone.
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Capture is an optimisation for tracking outside the strip, not a requirement: the moves over the strip still
      // arrive, so a drag can still be completed without it.
    }
  }, [])

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current
    if (g.pointerId !== event.pointerId || !g.paper) return
    g.samples.push({ position: event.clientY, time: event.timeStamp })
    if (g.samples.length > 8) g.samples.shift()

    const travel = event.clientY - g.anchorY
    if (!g.active) {
      if (Math.abs(travel) < ENGAGE_PX) return
      g.active = true
      // Taking over a sheet that is still moving: resume from where it is *now*, and re-anchor there, so the grab
      // neither jumps to the old position nor discards the movement that has already happened.
      if (settle.current) {
        settle.current.cancel()
        settle.current = null
        g.base = presentationOffset(g.paper)
        g.anchorY = event.clientY
      }
      setDragging(true)
    }
    // Down grows the sheet's distance from the top of the screen and follows the finger exactly; up has nowhere to go,
    // so it meets progressive resistance rather than a hard stop.
    const raw = g.base + (event.clientY - g.anchorY)
    const limit = g.paper.offsetHeight || 480
    const offset = raw <= 0 ? -rubberband(-raw, TOP_HEADROOM) : Math.min(raw, limit)
    g.paper.style.transform = `translateY(${offset}px)`
  }, [])

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current
    if (g.pointerId !== event.pointerId) return
    const { paper, active } = g
    gesture.current = IDLE
    if (!paper) return
    if (!active) {
      // It was a tap on the grabber: nothing was cancelled, so a settle that was already running simply carries on.
      setDragging(false)
      return
    }

    const height = paper.offsetHeight || 480
    const offset = presentationOffset(paper)
    const velocity = velocityFrom(g.samples)
    // Apple decides dismiss-or-return from the velocity's *direction* when the release is a flick, and from the
    // projected resting place when it is a slow let-go. Position alone is never the test.
    const flicked = Math.abs(velocity) > FLICK_VELOCITY
    const dismiss = flicked ? velocity > 0 : offset + projectMomentum(velocity) > Math.max(dismissDistance, height * 0.25)
    // Overshoot only where the gesture itself carried momentum into the release.
    const spring = Math.abs(velocity) > MOMENTUM_VELOCITY ? SPRING_MOMENTUM : SPRING_DEFAULT
    const { frames, duration } = springFrames(spring, offset, dismiss ? height : 0, velocity)
    const animation = paper.animate(frames, { duration, easing: 'linear', fill: 'forwards' })
    settle.current = animation
    setDragging(false)
    animation.finished
      .then(() => {
        // Hand the element back to CSS before dismissing, so MUI's own exit starts from a clean state and a stale
        // filling animation can never pin a reopened sheet off-screen.
        settle.current = null
        if (dismiss) {
          paper.style.transform = `translateY(${height}px)`
          animation.cancel()
          dismissRef.current()
        } else {
          paper.style.removeProperty('transform')
          animation.cancel()
        }
      })
      .catch(() => {
        // Interrupted: a new grab owns the transform from here, so there is nothing to clean up.
      })
  }, [dismissDistance])

  const onPointerCancel = useCallback(() => {
    const g = gesture.current
    gesture.current = IDLE
    g.paper?.style.removeProperty('transform')
    setDragging(false)
  }, [])

  return {
    handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    handleSx: { touchAction: 'none' },
    dragging,
  }
}
