// Owns: the app frame around every in-app page — top bar, banners, the page column, quick-log button and sheet (loaded
// on first open), navigation (desktop icon rail from `md` up, bottom tabs below it), the Ask AI slide-up panel and the
// ⌘K command palette — configured per route through its `handle` (title, tab, width, quick-log).
//
// A route change is deliberately *not* wrapped in a cross-fade, and that is the HIG's own behaviour rather than an
// omission: iOS switches tabs instantly, and only a push (a detail page) slides. This shell cannot tell a push from a
// tab change, and a whole-column fade would be a transition the platform does not have. What arrives still
// materialises: each page's own hero and card groups rise in through `Reveal`/`useEntrance` as they mount.
import Box from '@mui/material/Box'
import { useEffect } from 'react'
import { Outlet, ScrollRestoration } from 'react-router'
import { useUiStore } from '../../ui-store'
import { useRouteHandle } from '../route-handle'
import { AskAiHost } from './AskAiHost'
import { BottomTabs } from './BottomTabs'
import { CommandPalette } from './CommandPalette'
import { columnSx, contentBottomPadding, railInset } from './layout'
import { NavRail } from './NavRail'
import { QuickLogFab } from './QuickLogFab'
import { QuickLogHost } from './QuickLogHost'
import { StatusBanners } from './StatusBanners'
import { TopBar } from './TopBar'

export function AppShell() {
  const { title, tab, width = 'narrow', quickLog = false, hero = false } = useRouteHandle()
  const setLastTab = useUiStore((s) => s.setLastTab)

  useEffect(() => {
    if (tab) setLastTab(tab)
  }, [tab, setLastTab])

  useEffect(() => {
    document.title = tab === 'today' ? 'Fitness' : `${title} · Fitness`
  }, [tab, title])

  return (
    // The rail is a fixed layer beside the page, so the page column itself is inset by it rather than each centred
    // column being padded: the top bar, the banners, the content and the quick-log button are all inside this box.
    <Box sx={{ ...railInset, minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <NavRail active={tab} />
      <TopBar title={title} width={width} showBack={!tab} hero={hero} />
      <StatusBanners width={width} />
      <Box component="main" sx={{ ...columnSx(width), flex: 1, pt: 2, pb: contentBottomPadding(quickLog) }}>
        <Outlet />
      </Box>
      {quickLog && <QuickLogFab width={width} />}
      <BottomTabs active={tab} />
      <QuickLogHost />
      <AskAiHost />
      <CommandPalette />
      <ScrollRestoration />
    </Box>
  )
}
