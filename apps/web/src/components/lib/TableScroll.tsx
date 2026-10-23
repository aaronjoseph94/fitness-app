// Owns: README §4's table rule — a table (meal items, segments, every scan) sits in an `overflow-x: auto` wrapper with
// a 520 px minimum width inside, so on a phone it scrolls sideways within its card and the page never does. Given a
// name, the wrapper is a focusable region, so a keyboard can scroll it too (WCAG 2.1.1). While more of the table lies
// past an edge, that edge fades out (a CSS mask over the last 28 px, so it works on any card colour and changes no
// layout), which says "scroll for more" on a phone that shows no scrollbar (UX #18).
import Box from '@mui/material/Box'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { tokens } from '../../theme'

export interface TableScrollProps {
  children: ReactNode
  /** The inner minimum width, px. Default 520. */
  minWidth?: number
  /** Names the scroll region (and makes it focusable), e.g. "Meal items". */
  ariaLabel?: string
  testId?: string
}

const FADE = 28

type Edges = { start: boolean; end: boolean }

/** Which edges still hide content: scrollLeft > 0 → start; scrollLeft + clientWidth < scrollWidth → end (1 px slack). */
function edgesOf(el: HTMLElement): Edges {
  const max = el.scrollWidth - el.clientWidth
  return { start: el.scrollLeft > 1, end: el.scrollLeft < max - 1 }
}

function maskFor({ start, end }: Edges): string | undefined {
  if (!start && !end) return undefined
  const from = start ? `transparent, black ${FADE}px` : 'black'
  const to = end ? `black calc(100% - ${FADE}px), transparent` : 'black'
  return `linear-gradient(to right, ${from}, ${to})`
}

export function TableScroll({
  children,
  minWidth = tokens.layout.tableMin,
  ariaLabel,
  testId,
}: TableScrollProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState<Edges>({ start: false, end: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () =>
      setEdges((prev) => {
        const next = edgesOf(el)
        return prev.start === next.start && prev.end === next.end ? prev : next
      })
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    ro?.observe(el)
    if (el.firstElementChild) ro?.observe(el.firstElementChild)
    return () => {
      el.removeEventListener('scroll', update)
      ro?.disconnect()
    }
  }, [])

  const mask = maskFor(edges)
  // The ring sits on a plain wrapper: the mask would clip an outline drawn on the scroller itself.
  return (
    <Box
      sx={{
        minWidth: 0,
        maxWidth: '100%',
        borderRadius: `${tokens.radius.link}px`,
        '&:has(> [data-table-scroll]:focus-visible)': {
          outline: `${tokens.focusRing.width}px solid ${tokens.focusRing.color}`,
          outlineOffset: tokens.focusRing.offset,
        },
      }}
    >
      <Box
        ref={ref}
        data-table-scroll=""
        role={ariaLabel ? 'region' : undefined}
        aria-label={ariaLabel}
        tabIndex={ariaLabel ? 0 : undefined}
        data-testid={testId}
        data-scroll-start={edges.start || undefined}
        data-scroll-end={edges.end || undefined}
        sx={{
          overflowX: 'auto',
          overscrollBehaviorX: 'contain',
          minWidth: 0,
          maxWidth: '100%',
          outline: 'none',
          ...(mask ? { maskImage: mask, WebkitMaskImage: mask } : {}),
        }}
      >
        <Box sx={{ minWidth }}>{children}</Box>
      </Box>
    </Box>
  )
}
