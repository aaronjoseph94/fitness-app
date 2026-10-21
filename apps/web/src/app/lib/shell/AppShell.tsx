// Owns: the app frame around every in-app page (1d "Summit", README §3) — the sky hero at the top of `main` (Today's
// full sky, an inner page's, or the compact one) with the Summit nav drawn over it, the shell's banners on the sky, the
// hero slot a page's `PageHeader` renders into, and the cream panel holding the page; on a phone the fixed bottom tab
// bar and its clearance; the status bar's strip (the installed iOS app draws under the status bar, so a fixed strip in
// the sky's top colour keeps its white text off the cream panel once the page scrolls); the quick-log sheet (loaded on
// first open; Today's and Log's hero "+ Log" opens it), the Ask AI slide-up panel (the ⌘K palette's "Ask AI here"
// opens it over any page; the nav's gold pill goes to the AI tab) and the ⌘K command palette — configured per route
// through its `handle` (title, tab, trail, width, hero). On a phone the nav shows the logo on the tabs and on its own
// Scans and Settings, and a back circle on every other page.
//
// Every 1d page names itself in its sky with a `PageHeader` (its `h1`). A page that does not (yet) gets the route's
// title there from the shell instead — the header claims the slot from a layout effect, so the two are never on screen
// together.
//
// A route change is deliberately *not* wrapped in a cross-fade: the sky and the nav stay put, and each page's own hero
// content and card groups rise in through `Reveal`/`useEntrance` as they mount, which is 1d's one entrance.
import Box from '@mui/material/Box'
import type { Theme } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Outlet, ScrollRestoration, useLocation } from 'react-router'
import { HeroSlotProvider, SkyHero, SummitPanel, visuallyHidden, type HeroSlot } from '../../../components'
import { tokens, type HeroVariant } from '../../../theme'
import { useUiStore } from '../../ui-store'
import { APP_NAME } from '../../brand'
import { useRouteHandle } from '../route-handle'
import { SCANS_DESTINATION, SETTINGS_DESTINATION, tabByKey } from '../tabs'
import { AskAiHost } from './AskAiHost'
import { CommandPalette } from './CommandPalette'
import { navInset, pageWidthSx, safeArea, shellColumnSx, tabBarClearance } from './layout'
import { QuickLogHost } from './QuickLogHost'
import { StatusBanners } from './StatusBanners'
import { SummitNav, type Current } from './SummitNav'
import { TabBar } from './TabBar'

const { summit, font } = tokens

/** One page header on screen, and the sky it asked for. */
interface Claim {
  id: number
  variant: HeroVariant | null
}

let nextClaim = 0

/** The nav's own destinations beside the tabs (the Scans circle, the avatar): their pages show the logo, not a back. */
const NAV_ROOTS: ReadonlySet<string> = new Set([SCANS_DESTINATION.path, SETTINGS_DESTINATION.path])

/** The hero slot the shell offers its page: where a `PageHeader` portals, the sky variant, and who has claimed it. */
function useHeroSlotState(routeVariant: HeroVariant) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [claims, setClaims] = useState<readonly Claim[]>([])
  const claim = useCallback((variant: HeroVariant | null) => {
    const id = nextClaim++
    setClaims((all) => [...all, { id, variant }])
    return () => setClaims((all) => all.filter((c) => c.id !== id))
  }, [])
  const variant = claims.findLast((c) => c.variant !== null)?.variant ?? routeVariant
  const slot = useMemo<HeroSlot>(() => ({ target, variant, claim }), [target, variant, claim])
  return { slot, setTarget, claimed: claims.length > 0 }
}

/** The route's title in the sky while no `PageHeader` claims it (a page still loading its code, the not-found page). */
function FallbackHero({ title, compact }: { title: string; compact: boolean }) {
  return (
    <Box sx={{ ...shellColumnSx, pt: `${compact ? 14 : tokens.layout.hero.padTop}px` }}>
      <Typography
        component="h1"
        variant="h1"
        sx={{
          m: 0,
          color: summit.onSky.text,
          overflowWrap: 'anywhere',
          ...(compact && { fontSize: font.fluid.h1Compact }),
        }}
      >
        {title}
      </Typography>
    </Box>
  )
}

export function AppShell() {
  const { title, tab, trail = [], width = 'narrow', hero = 'inner' } = useRouteHandle()
  const { pathname } = useLocation()
  const setLastTab = useUiStore((s) => s.setLastTab)
  // Read synchronously on the first render, so a desktop never paints the phone chrome first. `md` is the nav's 960.
  const wide = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'), { noSsr: true })
  const main = useRef<HTMLElement>(null)
  const { slot, setTarget, claimed } = useHeroSlotState(hero)

  useEffect(() => {
    if (tab) setLastTab(tab)
  }, [tab, setLastTab])

  useEffect(() => {
    document.title = tab === 'today' ? APP_NAME : `${title} · ${APP_NAME}`
  }, [tab, title])

  // The page on screen and the section it sits under (the first step of its trail), for the nav's marks.
  const pagePath = tab ? tabByKey(tab).path : pathname
  const sectionPath = trail[0]?.path
  const showBack = !tab && !NAV_ROOTS.has(pathname.replace(/\/+$/, '') || '/')
  const currentOf = useCallback(
    (path: string): Current => (path === pagePath ? 'page' : path === sectionPath ? 'section' : null),
    [pagePath, sectionPath],
  )

  return (
    <Box
      sx={{
        position: 'relative',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: tokens.ink.page,
      }}
    >
      <Box
        component="a"
        href="#main"
        onClick={(event: MouseEvent) => {
          // Focus the page itself (it scrolls into view) without adding a #main step to the history.
          event.preventDefault()
          main.current?.focus()
        }}
        sx={{
          ...visuallyHidden,
          '&:focus': {
            clip: 'auto',
            clipPath: 'none',
            width: 'auto',
            height: 'auto',
            m: 0,
            top: 8,
            left: 8,
            zIndex: 'tooltip',
            px: 3,
            py: 2,
            borderRadius: `${tokens.radius.control}px`,
            bgcolor: tokens.dark.bg,
            color: tokens.dark.text,
            fontSize: tokens.font.size.body,
            fontWeight: tokens.font.weight.label,
            outline: `${tokens.focusRing.width}px solid ${summit.onSky.text}`,
            outlineOffset: tokens.focusRing.offset,
          },
        }}
      >
        Skip to content
      </Box>
      <SummitNav wide={wide} currentOf={currentOf} showBack={showBack} />
      {/* The status bar's strip: zero tall outside the installed iOS app. */}
      <Box
        aria-hidden
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: safeArea.top,
          zIndex: 'appBar',
          bgcolor: summit.sky.top,
          pointerEvents: 'none',
          displayPrint: 'none',
        }}
      />
      <Box
        component="main"
        id="main"
        ref={main}
        tabIndex={-1}
        sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, outline: 'none' }}
      >
        <HeroSlotProvider value={slot}>
          <SkyHero variant={slot.variant} topInset={navInset(wide)}>
            <StatusBanners />
            {!claimed && <FallbackHero title={title} compact={slot.variant === 'compact'} />}
            <Box ref={setTarget} sx={shellColumnSx} />
          </SkyHero>
          <SummitPanel extraBottom={wide ? undefined : tabBarClearance()}>
            <Box sx={pageWidthSx(width)}>
              <Outlet />
            </Box>
          </SummitPanel>
        </HeroSlotProvider>
      </Box>
      {!wide && <TabBar currentOf={currentOf} />}
      <QuickLogHost />
      <AskAiHost />
      <CommandPalette />
      <ScrollRestoration />
    </Box>
  )
}
