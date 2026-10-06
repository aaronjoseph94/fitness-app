// Owns: the app frame around every in-app page — top bar, banners, the page column, quick-log button and sheet (loaded
// on first open), bottom tabs, the Ask AI slide-up panel and the ⌘K command palette — configured per route through
// its `handle` (title, tab, width, quick-log).
import Box from '@mui/material/Box'
import { useEffect } from 'react'
import { Outlet, ScrollRestoration } from 'react-router'
import { useUiStore } from '../../ui-store'
import { useRouteHandle } from '../route-handle'
import { AskAiHost } from './AskAiHost'
import { BottomTabs } from './BottomTabs'
import { CommandPalette } from './CommandPalette'
import { columnSx, contentBottomPadding } from './layout'
import { QuickLogFab } from './QuickLogFab'
import { QuickLogHost } from './QuickLogHost'
import { StatusBanners } from './StatusBanners'
import { TopBar } from './TopBar'

export function AppShell() {
  const { title, tab, width = 'narrow', quickLog = false } = useRouteHandle()
  const setLastTab = useUiStore((s) => s.setLastTab)

  useEffect(() => {
    if (tab) setLastTab(tab)
  }, [tab, setLastTab])

  useEffect(() => {
    document.title = tab === 'today' ? 'Fitness' : `${title} · Fitness`
  }, [tab, title])

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <TopBar title={title} width={width} showBack={!tab} />
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
