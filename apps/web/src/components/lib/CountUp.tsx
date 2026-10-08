// Owns: the count-up number (2a: headline numbers count up over ~1.6 s on an exponential ease-out, once per mount).
//
// React renders the REAL value; on mount the component rewrites only its own text node's `nodeValue` frame by frame
// and finishes on exactly the string React rendered, so the DOM, assistive tech and any test that waits on the text all
// end on the true number, and React's own text updates are never fought (it writes the same text node). It plays:
//   • never under `prefers-reduced-motion` (the number is simply there);
//   • to the end even where the frame clock never ticks (a background tab, a non-compositing webview): a timer lands
//     the final string, because a count-up stuck half-way would show a wrong number, not a missed animation;
//   • once per mount — a later change of `value` just shows the new value.
import Box from '@mui/material/Box'
import { useLayoutEffect, useRef } from 'react'
import { countUpValue } from '../../motion/countUp'
import { prefersReducedMotion, tokens } from '../../theme'
import { formatNumber } from './format'

export interface CountUpProps {
  value: number
  /** Where the count starts. Default 0 (the weight trend counts down from the start weight). */
  from?: number
  /** Decimal places; every frame and the final value are `formatNumber(n, precision)` (en-CA grouping). Default 0. */
  precision?: number
  /** ms before counting starts, to line up with the card's entrance. Default 0. */
  delay?: number
}

export function CountUp({ value, from = 0, precision = 0, delay = 0 }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const played = useRef(false)
  const duration = tokens.motion.duration.count
  const fmt = (n: number) => formatNumber(n, precision)
  const text = fmt(value)

  useLayoutEffect(() => {
    const box = ref.current
    const node = box?.firstChild
    if (played.current || !box || !node || node.nodeType !== Node.TEXT_NODE || prefersReducedMotion() || !Number.isFinite(from)) return
    played.current = true
    const final = text
    // Hold the final number's width while it counts, so a unit or pill beside it never reflows mid-count.
    box.style.minWidth = `${box.getBoundingClientRect().width}px`
    let lastWritten = final
    const write = (s: string) => {
      lastWritten = s
      node.nodeValue = s
    }
    const begin = performance.now() + delay
    let frame = 0
    const finish = () => {
      cancelAnimationFrame(frame)
      write(final)
      box.style.minWidth = ''
    }
    const tick = (now: number) => {
      const elapsed = now - begin
      if (elapsed >= duration) return finish()
      write(fmt(countUpValue(from, value, Math.max(0, elapsed), duration)))
      frame = requestAnimationFrame(tick)
    }
    // Written before the first paint (this is a layout effect), so the real number never flashes up first.
    write(fmt(from))
    frame = requestAnimationFrame(tick)
    const timer = setTimeout(finish, delay + duration + 120)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
      box.style.minWidth = ''
      // Interrupted with React's text still ours (StrictMode's dev remount, an unmount): put the real value back and
      // allow a replay. If React already wrote a new value, it owns the node — leave it.
      if (node.nodeValue === lastWritten && lastWritten !== final) {
        node.nodeValue = final
        played.current = false
      }
    }
    // Once per mount: only `value` matters, and a change of it is shown as-is (see the cleanup).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <Box component="span" ref={ref} sx={{ display: 'inline-block' }}>
      {text}
    </Box>
  )
}
