// Owns: the Settings page's section nav (1d) — a white card of links, one per card, laid out
// `repeat(auto-fill, minmax(140px, 1fr))` (two up on a phone), sticky beside the cards from 760 px (README §4) and in
// the page's flow below that; the card under the top of the window shown active (a warm well inside the gold ring) as
// the page scrolls (each of the last cards in turn as the page nears its end), and a click that scrolls its card into
// view and moves focus to the card's heading. UI state only: it reads the page's own DOM, nothing else.
import Box from '@mui/material/Box'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { cardSurface, fixedCol, Reveal, useEntrance } from '../../../components'
import { COARSE_POINTER_QUERY, minWidth, tokens, transitionOf } from '../../../theme'

export interface NavSection {
  /** The card's element id (its heading is `${id}-title`, as `Panel` names it). */
  id: string
  label: string
}

/** A card is "current" once its top has passed just under the sticky header (the cards' own scroll margin). */
const ACTIVE_LINE = tokens.layout.scrollPadding.top + tokens.space(2)

/**
 * Which section the reader is in: the last one whose top has passed the line. The cards near the end can't scroll up
 * to the line, so over the page's last stretch of scroll (at most a viewport's worth) the line slides down with the
 * scroll, from ACTIVE_LINE to the viewport's bottom edge: line = ACTIVE_LINE + (innerHeight − ACTIVE_LINE) × t, where
 * t runs 0 → 1 over that stretch. Each of those cards becomes current in turn, and the last one at the very bottom.
 */
function currentSection(sections: readonly NavSection[]): string {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight
  const reach = window.innerHeight - ACTIVE_LINE
  const stretch = Math.min(maxScroll, reach)
  const t = stretch > 0 ? Math.min(1, Math.max(0, (window.scrollY - (maxScroll - stretch)) / stretch)) : 0
  const line = ACTIVE_LINE + reach * t
  let current = sections[0]!.id
  for (const section of sections) {
    const top = document.getElementById(section.id)?.getBoundingClientRect().top
    if (top !== undefined && top <= line) current = section.id
  }
  return current
}

/** README §4: the nav column's basis, px. */
const NAV_PX = 220
/** How far below the window's top the sticky nav rides, px. */
const STICKY_TOP = 24

export function SectionNav({ sections, delay = 0 }: { sections: readonly NavSection[]; delay?: number }) {
  const { reduced } = useEntrance()
  const [active, setActive] = useState(sections[0]!.id)
  /** A section just picked from the nav stays active until the reader scrolls by hand (a short card near the end can't reach the line). */
  const picked = useRef<string | null>(null)

  useEffect(() => {
    let frame = 0
    const read = () => {
      frame = 0
      if (picked.current === null) setActive(currentSection(sections))
    }
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(read)
    }
    const release = () => {
      picked.current = null
    }
    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    for (const kind of ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const)
      window.addEventListener(kind, release, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      for (const kind of ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const)
        window.removeEventListener(kind, release)
    }
  }, [sections])

  const go = (event: MouseEvent, id: string) => {
    event.preventDefault()
    const card = document.getElementById(id)
    if (!card) return
    picked.current = id
    setActive(id)
    card.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    // Like a native in-page link, move the reading position there too, without a second jump.
    const heading = document.getElementById(`${id}-title`)
    if (heading) {
      heading.tabIndex = -1
      heading.focus({ preventScroll: true })
    }
  }

  return (
    <Reveal
      delay={delay}
      sx={{
        ...fixedCol(NAV_PX),
        // Sticky beside the cards where they sit side by side; in the flow above them on a phone.
        [minWidth(tokens.layout.settingsNav)]: { position: 'sticky', top: STICKY_TOP },
      }}
    >
      <Box
        component="nav"
        aria-label="Settings sections"
        sx={{
          ...cardSurface,
          borderRadius: `${tokens.summit.radius.tabBar}px`,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: '4px',
          p: '10px',
        }}
      >
        {sections.map((section) => {
          const on = section.id === active
          return (
            <Box
              component="a"
              key={section.id}
              href={`#${section.id}`}
              aria-current={on ? 'location' : undefined}
              onClick={(event: MouseEvent) => go(event, section.id)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                minWidth: 0,
                px: '14px',
                py: '10px',
                borderRadius: `${tokens.summit.radius.wellSmall}px`,
                fontSize: tokens.font.size.emphasis,
                lineHeight: tokens.font.leading.label,
                [COARSE_POINTER_QUERY]: { minHeight: tokens.tapTarget },
                fontWeight: on ? tokens.font.weight.heading : tokens.font.weight.body,
                color: on ? tokens.ink.text : tokens.ink.label,
                bgcolor: on ? tokens.ink.panel : 'transparent',
                // The current section: 1d's gold ring, inside the link.
                boxShadow: on ? `inset 0 0 0 2px ${tokens.summit.gold.main}` : 'none',
                textDecoration: 'none',
                transition: transitionOf(['background-color', 'color'], tokens.motion.duration.instant),
                '&:hover': { bgcolor: tokens.ink.panel, color: tokens.ink.text },
                '&:focus-visible': {
                  outline: `${tokens.focusRing.width}px solid ${tokens.focusRing.color}`,
                  outlineOffset: tokens.focusRing.offset,
                },
              }}
            >
              {section.label}
            </Box>
          )
        })}
      </Box>
    </Reveal>
  )
}
