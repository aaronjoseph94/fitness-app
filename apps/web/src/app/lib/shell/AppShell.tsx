// Owns: the app frame around every in-app page (2a) — from `md` up the 240 px sidebar (or its 76 px icon rail) beside a
// 56 px breadcrumb header; on a phone the slim top bar and the bottom tabs — plus the banners, the page column, the
// phone's quick-log button, the quick-log sheet (loaded on first open), the Ask AI slide-up panel and the ⌘K command
// palette — configured per route through its `handle` (title, tab, trail, width, quick-log).
//
// Every 2a page opens with its own `h1`. A page that does not (yet) gets one from the shell instead, visually hidden at
// the top of `main` — the shell watches `main` for a page heading, so the two can never both be there.
//
// A route change is deliberately *not* wrapped in a cross-fade: each page's own title row and card groups rise in
// through `Reveal`/`useEntrance` as they mount, which is 2a's one entrance.
import Box from '@mui/material/Box'
import type { Theme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type RefObject } from 'react'
import { Outlet, ScrollRestoration, useLocation } from 'react-router'
import { visuallyHidden } from '../../../components'
import { tokens } from '../../../theme'
import { useUiStore } from '../../ui-store'
import { APP_NAME } from '../../brand'
import { useRouteHandle } from '../route-handle'
import { tabByKey } from '../tabs'
import { AskAiHost } from './AskAiHost'
import { BottomTabs } from './BottomTabs'
import { CommandPalette } from './CommandPalette'
import { DesktopHeader, PhoneTopBar } from './Header'
import { mainPaddingSx, NAV_VAR, navInset, navWidth, pageWidthSx, shellColumnSx } from './layout'
import { QuickLogFab } from './QuickLogFab'
import { QuickLogHost } from './QuickLogHost'
import { Sidebar } from './Sidebar'
import { StatusBanners } from './StatusBanners'

/** The page's own heading: any `h1` but the shell's fallback, which is marked `data-shell-title`. */
const PAGE_TITLE = 'h1:not([data-shell-title])'

/**
 * Whether the page inside `main` renders its own `h1`. Re-read whenever `main`'s tree changes (a lazy page arriving, a
 * skeleton giving way to the page), not on text changes, so a counting number costs nothing.
 */
function usePageHasTitle(main: RefObject<HTMLElement | null>): boolean {
  const [hasTitle, setHasTitle] = useState(false)
  useLayoutEffect(() => {
    const element = main.current
    if (!element) return
    const read = () => setHasTitle(element.querySelector(PAGE_TITLE) !== null)
    read()
    const observer = new MutationObserver(read)
    observer.observe(element, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [main])
  return hasTitle
}

export function AppShell() {
  const { title, tab, trail = [], width = 'narrow', quickLog = false } = useRouteHandle()
  const { pathname } = useLocation()
  const setLastTab = useUiStore((s) => s.setLastTab)
  const storedCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed)
  // Read synchronously on the first render, so a desktop never paints the phone chrome first.
  const desktop = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'), { noSsr: true })
  const large = useMediaQuery((theme: Theme) => theme.breakpoints.up('lg'), { noSsr: true })
  // Until Aaron picks, the sidebar follows the window: labelled from `lg`, the icon rail between `md` and `lg`.
  const collapsed = storedCollapsed ?? !large
  const main = useRef<HTMLElement>(null)
  const pageHasTitle = usePageHasTitle(main)

  useEffect(() => {
    if (tab) setLastTab(tab)
  }, [tab, setLastTab])

  useEffect(() => {
    document.title = tab === 'today' ? APP_NAME : `${title} · ${APP_NAME}`
  }, [tab, title])

  return (
    // The sidebar is a fixed layer beside the page, so the page column itself is inset by it rather than each centred
    // column being padded: the header, the banners and the content are all inside this box.
    <Box
      sx={{
        [NAV_VAR]: desktop ? `${navWidth(collapsed)}px` : '0px',
        pl: navInset,
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: tokens.ink.page,
        '@media print': { [NAV_VAR]: '0px' },
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
            outline: `${tokens.focusRing.width}px solid ${tokens.focusRing.color}`,
            outlineOffset: tokens.focusRing.offset,
          },
        }}
      >
        Skip to content
      </Box>
      {desktop && (
        <Sidebar
          collapsed={collapsed}
          pagePath={tab ? tabByKey(tab).path : pathname}
          sectionPath={trail[0]?.path}
        />
      )}
      {desktop ? (
        <DesktopHeader
          title={title}
          trail={trail}
          sidebarCollapsed={collapsed}
          onToggleSidebar={() => setSidebarCollapsed(!collapsed)}
        />
      ) : (
        <PhoneTopBar title={title} showBack={!tab} pageHasTitle={pageHasTitle} />
      )}
      <StatusBanners />
      <Box
        component="main"
        id="main"
        ref={main}
        tabIndex={-1}
        sx={{ ...shellColumnSx, ...mainPaddingSx(quickLog && !desktop), flex: 1, outline: 'none' }}
      >
        <Box sx={pageWidthSx(width)}>
          {!pageHasTitle && (
            <Box component="h1" data-shell-title="" sx={visuallyHidden}>
              {title}
            </Box>
          )}
          <Outlet />
        </Box>
      </Box>
      {quickLog && !desktop && <QuickLogFab width={width} />}
      {!desktop && <BottomTabs active={tab} />}
      <QuickLogHost />
      <AskAiHost />
      <CommandPalette />
      <ScrollRestoration />
    </Box>
  )
}
