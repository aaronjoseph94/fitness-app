// Owns: the bar at the top of every in-app page. From `md` up it is 2a's 56 px header: the sidebar toggle, the
// breadcrumb ("Fitness › Train › Session"), the search field that opens the ⌘K command palette, "Ask AI" (the slide-up
// panel; not on the AI tab, which is the chat), Reminders, and the avatar that opens Settings. On a phone it is the
// slim top bar: a back arrow on a page below a tab (the brand tile on a tab), the page's name once the page's own title
// has scrolled under it, the sync chip, Ask AI and Settings. Either one shows a thin progress line while a lazy page
// loads.
//
// Neither bar holds a heading: 2a gives every page its own 26 px `h1`, so the bar names the page only as a breadcrumb
// (desktop) or a visual echo of the title (phone).
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded'
import SearchRounded from '@mui/icons-material/SearchRounded'
import ViewSidebarOutlined from '@mui/icons-material/ViewSidebarOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import type { ReactNode } from 'react'
import { Link, useMatch, useNavigate, useNavigation } from 'react-router'
import { outlinedIconButton } from '../../../components'
import { COARSE_POINTER_QUERY, tokens, transitionOf } from '../../../theme'
import { useUiStore } from '../../ui-store'
import type { Crumb } from '../route-handle'
import { tabByKey } from '../tabs'
import { BrandTile } from './BrandTile'
import { HEADER_HEIGHT, safeArea, shellColumnSx } from './layout'
import { SIDEBAR_ID } from './Sidebar'
import { OWNER, SyncStatus } from './SyncStatus'
import { useScrolled } from './useScrolled'

/** The palette's shortcut as this keyboard writes it. */
const SHORTCUT =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K'

/** A keyboard focus ring for a plain link (MUI draws one only on its own buttons). */
const linkFocus = {
  borderRadius: '4px',
  '&:focus-visible': {
    outline: `${tokens.focusRing.width}px solid ${tokens.focusRing.color}`,
    outlineOffset: tokens.focusRing.offset,
  },
} as const

/** The bar's shell: sticky, white, the 2a hairline under it (56 px in all, so a sticky bar below sits flush). */
function Bar({ children }: { children: ReactNode }) {
  const loading = useNavigation().state === 'loading'
  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 'appBar',
        pt: safeArea.top,
        bgcolor: tokens.ink.card,
        borderBottom: `1px solid ${tokens.ink.border}`,
        displayPrint: 'none',
      }}
    >
      <Box
        sx={{ ...shellColumnSx, height: HEADER_HEIGHT - 1, display: 'flex', alignItems: 'center', gap: 3 }}
      >
        {children}
      </Box>
      {loading && (
        <LinearProgress
          aria-label="Loading page"
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: -1,
            height: 2,
            borderRadius: 0,
            bgcolor: 'transparent',
          }}
        />
      )}
    </Box>
  )
}

/** 2a's 32 px blue avatar, opening Settings (a 44 px target on a touch screen). */
function AvatarLink({ current }: { current: boolean }) {
  return (
    <ButtonBase
      component={Link}
      to="/settings"
      aria-label="Settings"
      aria-current={current ? 'page' : undefined}
      sx={{
        flex: 'none',
        width: 32,
        height: 32,
        borderRadius: '50%',
        [COARSE_POINTER_QUERY]: { width: tokens.tapTarget, height: tokens.tapTarget },
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 32,
          height: 32,
          display: 'grid',
          placeItems: 'center',
          borderRadius: '50%',
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          fontSize: tokens.font.size.small,
          fontWeight: tokens.font.weight.heading,
        }}
      >
        {OWNER.initial}
      </Box>
    </ButtonBase>
  )
}

function Breadcrumb({ title, trail }: { title: string; trail: readonly Crumb[] }) {
  const separator = (
    <ChevronRightRounded aria-hidden sx={{ fontSize: 16, color: tokens.ink.faint, flex: 'none' }} />
  )
  // On a tight row the steps after "Fitness" give way with an ellipsis (the page's own name last) rather than running
  // under the search field; each keeps its first letters.
  const step = { display: 'flex', alignItems: 'center', gap: 2, minWidth: 'calc(24px + 2.5em)' } as const
  const clip = {
    minWidth: '2.5em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as const
  const link = (crumb: Crumb) => (
    <Box
      component={Link}
      to={crumb.path}
      sx={{
        ...clip,
        ...linkFocus,
        color: tokens.ink.muted,
        transition: transitionOf('color', tokens.motion.duration.fast),
        '&:hover': { color: tokens.ink.text },
      }}
    >
      {crumb.title}
    </Box>
  )
  return (
    <Box component="nav" aria-label="Breadcrumb" sx={{ minWidth: 0 }}>
      <Box
        component="ol"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          listStyle: 'none',
          minWidth: 0,
          overflow: 'hidden',
          // Room inside the clip for the links' focus rings.
          m: '-4px',
          p: '4px',
          fontSize: tokens.font.size.body,
          lineHeight: tokens.font.leading.body,
        }}
      >
        <Box component="li" sx={{ flex: 'none' }}>
          {link({ title: 'Fitness', path: '/' })}
        </Box>
        {trail.map((crumb) => (
          <Box component="li" key={crumb.path} sx={step}>
            {separator}
            {link(crumb)}
          </Box>
        ))}
        <Box component="li" sx={{ ...step, flexShrink: 0.25 }}>
          {separator}
          <Box
            component="span"
            aria-current="page"
            sx={{ ...clip, fontWeight: tokens.font.weight.label, color: tokens.ink.text }}
          >
            {title}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

/** The search field: a button dressed as 2a's 260 × 36 input, because what it opens is the palette, not a search. */
function SearchField() {
  const openPalette = useUiStore((s) => s.setPaletteOpen)
  return (
    <ButtonBase
      aria-label="Search and commands"
      aria-haspopup="dialog"
      aria-keyshortcuts="Meta+K Control+K"
      data-testid="palette-open"
      onClick={() => openPalette(true)}
      sx={{
        // On a tight row it narrows (to 140) before the breadcrumb starts to clip.
        flex: '0 4 260px',
        minWidth: 140,
        height: 36,
        px: '10px',
        gap: 2,
        justifyContent: 'flex-start',
        borderRadius: `${tokens.radius.control}px`,
        border: `1px solid ${tokens.ink.border}`,
        bgcolor: tokens.ink.card,
        color: tokens.ink.muted,
        fontSize: tokens.font.size.body,
        transition: transitionOf('border-color', tokens.motion.duration.fast),
        '&:hover': { borderColor: tokens.ink.faint },
      }}
    >
      <SearchRounded aria-hidden sx={{ fontSize: 18, flex: 'none' }} />
      <Box
        component="span"
        sx={{
          flex: 1,
          minWidth: 0,
          textAlign: 'left',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        Search…
      </Box>
      <Box
        component="kbd"
        aria-hidden
        sx={{
          flex: 'none',
          px: '6px',
          py: '1px',
          borderRadius: '5px',
          border: `1px solid ${tokens.ink.border}`,
          bgcolor: tokens.ink.panel,
          fontFamily: 'inherit',
          fontSize: tokens.font.size.micro,
          fontWeight: tokens.font.weight.label,
          lineHeight: tokens.font.leading.micro,
        }}
      >
        {SHORTCUT}
      </Box>
    </ButtonBase>
  )
}

interface DesktopHeaderProps {
  title: string
  trail: readonly Crumb[]
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
}

export function DesktopHeader({ title, trail, sidebarCollapsed, onToggleSidebar }: DesktopHeaderProps) {
  const onAskAi = useMatch('/ai') !== null
  const onSettings = useMatch('/settings') !== null
  const onReminders = useMatch('/settings/reminders') !== null
  const openAskAi = useUiStore((s) => s.setAskAiOpen)
  return (
    <Bar>
      <IconButton
        size="small"
        aria-label="Toggle sidebar"
        aria-expanded={!sidebarCollapsed}
        aria-controls={SIDEBAR_ID}
        onClick={onToggleSidebar}
        // 2a draws only the 18 px glyph on the 28 px padding line: the button's padding hangs out on both sides.
        sx={{ mx: '-6px', color: tokens.ink.muted }}
      >
        {/* Mirrored: the panel on the left, where the sidebar is. */}
        <ViewSidebarOutlined sx={{ fontSize: 18, transform: 'scaleX(-1)' }} />
      </IconButton>
      <Box aria-hidden sx={{ width: '1px', height: 18, flex: 'none', bgcolor: tokens.ink.border }} />
      <Breadcrumb title={title} trail={trail} />
      <Box sx={{ flex: 1 }} />
      <SearchField />
      {!onAskAi && (
        <Button
          variant="outlined"
          data-testid="ask-ai-open"
          startIcon={<AutoAwesomeRounded sx={{ color: tokens.accent.main }} />}
          onClick={() => openAskAi(true)}
          sx={{ flex: 'none' }}
        >
          Ask AI
        </Button>
      )}
      <IconButton
        component={Link}
        to="/settings/reminders"
        aria-label="Reminders"
        aria-current={onReminders ? 'page' : undefined}
        sx={{ ...outlinedIconButton, flex: 'none', color: tokens.ink.body }}
      >
        <NotificationsNoneRounded sx={{ fontSize: 18 }} />
      </IconButton>
      <AvatarLink current={onSettings} />
    </Bar>
  )
}

interface PhoneTopBarProps {
  title: string
  showBack: boolean
  /** The page shows its own title: the bar repeats the name only once that title has scrolled under it. */
  pageHasTitle: boolean
}

export function PhoneTopBar({ title, showBack, pageHasTitle }: PhoneTopBarProps) {
  const back = useBack()
  const onAskAi = useMatch('/ai') !== null
  const onSettings = useMatch('/settings') !== null
  const openAskAi = useUiStore((s) => s.setAskAiOpen)
  const scrolled = useScrolled(48)
  const showTitle = scrolled || !pageHasTitle
  return (
    <Bar>
      {showBack ? (
        <IconButton
          aria-label="Back"
          onClick={back}
          sx={{ ml: '-8px', [COARSE_POINTER_QUERY]: { ml: '-12px' } }}
        >
          <ArrowBackRounded fontSize="small" />
        </IconButton>
      ) : (
        <BrandTile />
      )}
      {/* A visual echo of the page's own h1 (or of the shell's, for a page without one), so it is hidden from assistive tech. */}
      <Box
        aria-hidden
        sx={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: tokens.font.size.itemTitle,
          fontWeight: tokens.font.weight.heading,
          lineHeight: tokens.font.leading.itemTitle,
          color: tokens.ink.text,
          opacity: showTitle ? 1 : 0,
          transition: transitionOf('opacity', tokens.motion.duration.fast),
        }}
      >
        {title}
      </Box>
      <SyncStatus />
      {!onAskAi && (
        <IconButton aria-label="Ask AI" data-testid="ask-ai-open" onClick={() => openAskAi(true)}>
          <AutoAwesomeRounded sx={{ fontSize: 20, color: tokens.accent.main }} />
        </IconButton>
      )}
      {!onSettings && <AvatarLink current={false} />}
    </Bar>
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
