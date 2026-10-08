// Owns: the slot a Recharts surface sits in. Until the surface is drawn the slot is an empty box of exactly the plot's
// size, so the chart's frame (title, legend, unit captions) paints at once and nothing moves when the plot arrives.
// The surface is drawn once Recharts has loaded (preload.ts), the slot is near the viewport, and the rest of the page
// has rendered (a deferred render, so the page paints first). <EagerCharts> (the printable report) and a fixed width
// (print) draw it on the first render instead. If Recharts can't be fetched (offline before the service worker cached
// it), the slot says so (2a's dashed empty slot) and the rest of the page stays.
import Box from '@mui/material/Box'
import { createContext, Suspense, use, useContext, useDeferredValue, useEffect, useState, type ReactNode, type RefObject } from 'react'
import { LoadBoundary } from '../../components'
import { preloadCharts, type RechartsModule } from '../preload'
import { plotSlot, useWidth } from './frame'

const Eager = createContext(false)

/** Charts inside draw on the first render (no viewport wait, no deferral): the report prints them straight away. */
export function EagerCharts({ children }: { children: ReactNode }) {
  return <Eager value>{children}</Eager>
}

/** How far outside the viewport a plot starts drawing, so it is ready by the time it scrolls in. */
const NEAR_VIEWPORT = '300px 0px'

/** True once the element has come within NEAR_VIEWPORT of the viewport (it stays true). */
function useNearViewport(ref: RefObject<HTMLDivElement | null>, skip: boolean): boolean {
  const [near, setNear] = useState(false)
  useEffect(() => {
    if (skip || near) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setNear(true)
    }, { rootMargin: NEAR_VIEWPORT })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, skip, near])
  return near
}

export interface PlotProps {
  /** Fixed pixel width (print); omit to fill the container. */
  width?: number
  /** The surface's height in px: the slot keeps exactly this height before and after it is drawn. */
  height: number
  /** Draws the surface from the Recharts module; `plotWidth` is the slot's width in px (for tick spacing). */
  children: (recharts: RechartsModule, plotWidth: number) => ReactNode
}

function Surface({ draw, plotWidth }: { draw: PlotProps['children']; plotWidth: number }) {
  return draw(use(preloadCharts()), plotWidth)
}

export function Plot({ width, height, children }: PlotProps) {
  const eager = useContext(Eager) || width !== undefined
  const [ref, plotWidth] = useWidth(width)
  const near = useNearViewport(ref, eager)
  // The first render shows the empty slot; the surface follows in a background render, after the page has painted.
  const deferred = useDeferredValue(near, false)
  const slot = <Box aria-hidden data-plot="loading" sx={{ height }} />
  const failed = (
    <Box data-plot="failed" sx={{ ...plotSlot, height }}>
      This chart couldn’t load. Reload the app once you’re online.
    </Box>
  )
  return (
    <Box ref={ref} sx={{ width: width ?? '100%', minWidth: 0 }}>
      {eager || deferred ? (
        <LoadBoundary fallback={failed}>
          <Suspense fallback={slot}>
            <Surface draw={children} plotWidth={plotWidth} />
          </Suspense>
        </LoadBoundary>
      ) : (
        slot
      )}
    </Box>
  )
}
