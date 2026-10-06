// Owns: the slim sticky top bar — back arrow on non-tab pages, page title, the command-palette trigger (desktop only),
// sync status, the Ask AI button (opens the slide-up panel; hidden on the AI tab, which is the chat), settings gear —
// and the thin progress line while a lazy page loads.
import ArrowBackIosNew from '@mui/icons-material/ArrowBackIosNew'
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
import SearchRounded from '@mui/icons-material/SearchRounded'
import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import { Link, useMatch, useNavigate, useNavigation } from 'react-router'
import { useUiStore } from '../../ui-store'
import type { PageWidth } from '../route-handle'
import { tabByKey } from '../tabs'
import { columnSx, safeArea, TOP_BAR_HEIGHT } from './layout'
import { SyncStatus } from './SyncStatus'

interface TopBarProps {
  title: string
  width: PageWidth
  showBack: boolean
}

export function TopBar({ title, width, showBack }: TopBarProps) {
  const back = useBack()
  const onSettings = useMatch('/settings') !== null
  const onAskAi = useMatch('/ai') !== null
  const openAskAi = useUiStore((s) => s.setAskAiOpen)
  const openPalette = useUiStore((s) => s.setPaletteOpen)
  const loading = useNavigation().state === 'loading'
  return (
    <Box
      component="header"
      sx={{ position: 'sticky', top: 0, zIndex: 'appBar', bgcolor: 'background.default', pt: safeArea.top, displayPrint: 'none' }}
    >
      <Box sx={{ ...columnSx(width), height: TOP_BAR_HEIGHT, display: 'flex', alignItems: 'center', gap: 2 }}>
        {showBack && (
          <IconButton aria-label="Back" edge="start" onClick={back}>
            <ArrowBackIosNew fontSize="small" />
          </IconButton>
        )}
        <Typography component="h1" variant="h3" noWrap sx={{ flex: 1, minWidth: 0 }}>
          {title}
        </Typography>
        <IconButton
          aria-label="Search and commands"
          data-testid="palette-open"
          onClick={() => openPalette(true)}
          // Keyboard-first, so it stays off the phone's bar, where there is no keyboard to finish the shortcut with.
          sx={{ display: { xs: 'none', md: 'inline-flex' } }}
        >
          <SearchRounded />
        </IconButton>
        <SyncStatus />
        {!onAskAi && (
          <IconButton aria-label="Ask AI" data-testid="ask-ai-open" onClick={() => openAskAi(true)}>
            <AutoAwesomeOutlined />
          </IconButton>
        )}
        {!onSettings && (
          <IconButton aria-label="Settings" edge="end" component={Link} to="/settings">
            <SettingsOutlined />
          </IconButton>
        )}
      </Box>
      {loading && (
        <LinearProgress
          color="inherit"
          aria-label="Loading page"
          sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, color: 'text.secondary' }}
        />
      )}
    </Box>
  )
}

/** Back through history when there is any, otherwise to the last tab (a deep link or a fresh launch). */
function useBack(): () => void {
  const navigate = useNavigate()
  const lastTab = useUiStore((s) => s.lastTab)
  return () => {
    const index = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (index > 0) void navigate(-1)
    else void navigate(tabByKey(lastTab).path)
  }
}
