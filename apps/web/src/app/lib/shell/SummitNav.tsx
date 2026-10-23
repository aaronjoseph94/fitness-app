// Owns: the Summit nav at the top of every in-app page, drawn as glass over the sky (README §3). From `md` (960 px) up:
// the 46 px logo tile (→ Today), a glass pill with the six tabs (their `title`; the active one white with deep ink),
// then on the right the sync chip, the ⌘K command palette's search circle, the Scans circle, the gold "Ask AI" pill
// (→ the AI tab; not drawn on the AI tab itself) and the avatar (→ Settings). Under `lg` (1,200 px) the row tightens
// so it fits from 960 px, in this order: the tabs' padding narrows and the sync chip keeps only its glyph, then under
// `layout.navSearch` the search circle goes (⌘K still opens the palette); the Ask AI pill keeps its words throughout.
// On a phone: the 44 px logo tile (a back circle instead on a page the nav does not list — a session, a scan, a
// Settings page, Photos, Plan history; it goes back, or with no history to the route's parent, the last step of its
// `trail`), the sync chip (glyph only under 480 px), the palette's search circle, the Scans circle and the avatar — the tabs are the fixed bottom
// bar (`TabBar`). A thin gold line runs along the top (under the status bar) while a lazy page loads. The nav falls in
// once, when the app first opens.
//
// The current destination is marked the 1d way (white with deep ink, the filled glyph on the phone) and with
// `aria-current="page"`; on a page below a section (a session under Train, a scan under Scans, a Settings page) the
// section's item keeps the mark with `aria-current="true"`: it is where the page lives, not the page itself. Every
// item keeps its 2a `rail-*` test id. On the sky the keyboard ring is white (the violet one is under 3:1 there).
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import PersonRounded from '@mui/icons-material/PersonRounded'
import SearchRounded from '@mui/icons-material/SearchRounded'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import LinearProgress from '@mui/material/LinearProgress'
import Tooltip from '@mui/material/Tooltip'
import type { ReactNode } from 'react'
import { Link, useNavigate, useNavigation } from 'react-router'
import { skyFocus, useEntrance, visuallyHidden } from '../../../components'
import {
  COARSE_POINTER_QUERY,
  enterEasing,
  reducedEntrance,
  theme,
  tokens,
  transitionOf,
} from '../../../theme'
import { useUiStore } from '../../ui-store'
import { SCANS_DESTINATION, SETTINGS_DESTINATION, TABS, tabByKey, type Destination } from '../tabs'
import { BrandTile } from './BrandTile'
import { safeArea, shellColumnSx } from './layout'
import { SyncStatus } from './SyncStatus'

const { summit, font, motion, layout } = tokens

/** How a destination relates to the page on screen: it is the page, it holds the page, or neither. */
export type Current = 'page' | 'section' | null

const ariaCurrent = (current: Current) =>
  current === 'page' ? ('page' as const) : current === 'section' ? ('true' as const) : undefined

/** The palette's shortcut as this keyboard writes it. */
const SHORTCUT =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K'

/** Below `lg` (1,200 px): the tabs' padding narrows and the sync chip keeps only its glyph (its words stay for
 * assistive tech). */
const TIGHT = theme.breakpoints.down('lg')
/** Below `layout.navSearch`: the search circle goes too (⌘K still opens the palette). */
const TIGHTER = `@media (max-width: ${layout.navSearch - 0.05}px)`

/** A phone under 480 px: the sync chip keeps only its glyph, so the logo, search, Scans and avatar never crowd. */
const PHONE_NARROW = '@media (max-width: 479.95px)'

/** A 46 px (44 on a phone) glass circle: the Scans link, the palette's search, the back arrow. */
const circle = (size: number) => ({
  width: size,
  height: size,
  flex: 'none',
  borderRadius: '50%',
  boxSizing: 'border-box',
  border: `1px solid ${summit.glass.tileBorder}`,
  bgcolor: summit.glass.fill,
  color: summit.onSky.text,
  transition: transitionOf('background-color', motion.duration.fast),
  '&:hover': { bgcolor: summit.glass.fillHover },
  ...skyFocus,
})

function TabPill({ tab, current }: { tab: Destination; current: Current }) {
  const active = current !== null
  return (
    <ButtonBase
      component={Link}
      to={tab.path}
      data-testid={tab.testId}
      aria-current={ariaCurrent(current)}
      sx={{
        px: active ? '18px' : '16px',
        py: '9px',
        [TIGHT]: { px: active ? '14px' : '12px' },
        borderRadius: `${summit.radius.pill}px`,
        fontSize: font.size.emphasis,
        fontWeight: font.weight.label,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        color: active ? summit.tabBar.activeText : summit.glass.text,
        bgcolor: active ? summit.tabBar.active : 'transparent',
        transition: transitionOf(['background-color', 'color'], motion.duration.fast),
        '&:hover': active ? {} : { bgcolor: summit.glass.tile, color: summit.onSky.text },
        [COARSE_POINTER_QUERY]: { minHeight: tokens.tapTarget },
        ...skyFocus,
      }}
    >
      {tab.title}
    </ButtonBase>
  )
}

function ScansCircle({ current, size }: { current: Current; size: 44 | 46 }) {
  const Icon = current ? SCANS_DESTINATION.ActiveIcon : SCANS_DESTINATION.Icon
  return (
    <ButtonBase
      component={Link}
      to={SCANS_DESTINATION.path}
      aria-label={SCANS_DESTINATION.title}
      aria-current={ariaCurrent(current)}
      data-testid={SCANS_DESTINATION.testId}
      sx={{
        ...circle(size),
        ...(current && { bgcolor: summit.tabBar.active, color: summit.tabBar.activeText }),
        '&:hover': { bgcolor: current ? summit.avatar.hover : summit.glass.fillHover },
      }}
    >
      <Icon aria-hidden sx={{ fontSize: 22 }} />
    </ButtonBase>
  )
}

/** The avatar → Settings. The profile carries no name to take an initial from, so it shows a person glyph. */
function AvatarLink({ current, size }: { current: Current; size: 44 | 46 }) {
  return (
    <ButtonBase
      component={Link}
      to={SETTINGS_DESTINATION.path}
      aria-label={SETTINGS_DESTINATION.title}
      aria-current={ariaCurrent(current)}
      data-testid={SETTINGS_DESTINATION.testId}
      sx={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: '50%',
        bgcolor: summit.avatar.bg,
        color: summit.avatar.text,
        // The current page is marked with a gold ring as well as `aria-current`.
        boxShadow: current ? `0 0 0 3px ${summit.gold.main}` : 'none',
        transition: transitionOf('background-color', motion.duration.fast),
        '&:hover': { bgcolor: summit.avatar.hover },
        ...skyFocus,
      }}
    >
      <PersonRounded aria-hidden sx={{ fontSize: 24 }} />
    </ButtonBase>
  )
}

/** The gold Ask AI pill → the AI tab; on the AI tab itself there is nothing to go to, so it is not drawn. */
function AskAiPill({ current }: { current: Current }) {
  const ai = tabByKey('ai')
  if (current === 'page') return null
  return (
    <ButtonBase
      component={Link}
      to={ai.path}
      data-testid="ask-ai-open"
      sx={{
        height: 46,
        flex: 'none',
        gap: '6px',
        px: '18px',
        borderRadius: `${summit.radius.pill}px`,
        backgroundImage: summit.cta.gold.bg,
        color: summit.cta.gold.text,
        boxShadow: summit.cta.gold.shadow,
        fontSize: font.size.emphasis,
        fontWeight: font.weight.label,
        whiteSpace: 'nowrap',
        transition: transitionOf('box-shadow', motion.duration.fast),
        '&:hover': { boxShadow: summit.cta.gold.shadowHover },
        ...skyFocus,
      }}
    >
      <AutoAwesomeRounded aria-hidden sx={{ fontSize: 20 }} />
      {ai.title}
    </ButtonBase>
  )
}

/** The palette's opener: on a desktop beside the Scans circle (gone under `layout.navSearch`, where ⌘K still works);
 * on a phone it is the only way in, so it always shows there. */
function SearchCircle({ size }: { size: 44 | 46 }) {
  const openPalette = useUiStore((s) => s.setPaletteOpen)
  const button = (
    <ButtonBase
      aria-label="Search and commands"
      aria-haspopup="dialog"
      aria-keyshortcuts="Meta+K Control+K"
      data-testid="palette-open"
      onClick={() => openPalette(true)}
      sx={{ ...circle(size), ...(size === 46 && { [TIGHTER]: { display: 'none' } }) }}
    >
      <SearchRounded aria-hidden sx={{ fontSize: 22 }} />
    </ButtonBase>
  )
  // The shortcut hint is for a keyboard; on a phone the tooltip would only linger after the palette closes.
  return size === 46 ? <Tooltip title={`Search and commands · ${SHORTCUT}`}>{button}</Tooltip> : button
}

/**
 * Back through history when there is any; otherwise (a deep link, a fresh launch) up to the page's parent — the last
 * step of its route `trail` — and only for a page with no trail to the last tab.
 */
function useBack(parent: string | undefined): () => void {
  const navigate = useNavigate()
  const lastTab = useUiStore((s) => s.lastTab)
  return () => {
    const index = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (index > 0) void navigate(-1)
    else void navigate(parent ?? tabByKey(lastTab).path)
  }
}

function LogoLink({ size }: { size: 44 | 46 }) {
  return (
    <Box
      component={Link}
      to="/"
      aria-label={tabByKey('today').title}
      sx={{ display: 'block', flex: 'none', borderRadius: `${summit.radius.navTile}px`, ...skyFocus }}
    >
      <BrandTile size={size} />
    </Box>
  )
}

/** The sky's loading line while a lazy page arrives. */
function LoadingLine() {
  const loading = useNavigation().state === 'loading'
  if (!loading) return null
  return (
    <LinearProgress
      aria-label="Loading page"
      sx={{
        position: 'fixed',
        top: safeArea.top,
        left: 0,
        right: 0,
        zIndex: 'tooltip',
        height: 3,
        borderRadius: 0,
        bgcolor: 'transparent',
        '& .MuiLinearProgress-bar': { backgroundImage: summit.cta.gold.bg },
      }}
    />
  )
}

interface SummitNavProps {
  /** Desktop (≥ 960 px): the tab pill; otherwise the phone's top bar (the tabs are the bottom bar). */
  wide: boolean
  /** The current state of each destination the nav lists. */
  currentOf: (path: string) => Current
  /** A page the nav does not list (below a tab or a Settings / Scans page): the phone shows a back circle. */
  showBack: boolean
  /** Where the back circle goes when there is no history: the route's parent (its trail's last step). */
  parent?: string
}

export function SummitNav({ wide, currentOf, showBack, parent }: SummitNavProps) {
  const back = useBack(parent)
  const { entered, reduced } = useEntrance()
  const size = wide ? 46 : 44
  const row: ReactNode = wide ? (
    <>
      <LogoLink size={46} />
      <Box
        component="nav"
        aria-label="Main"
        sx={{
          display: 'flex',
          gap: '4px',
          ml: '12px',
          p: '5px',
          minWidth: 0,
          borderRadius: `${summit.radius.pill}px`,
          bgcolor: summit.glass.fill,
          border: `1px solid ${summit.glass.border}`,
          backdropFilter: `blur(${summit.glass.blur}px)`,
        }}
      >
        {TABS.map((tab) => (
          <TabPill key={tab.key} tab={tab} current={currentOf(tab.path)} />
        ))}
      </Box>
      <Box sx={{ flex: 1 }} />
      <Box
        sx={{
          display: 'contents',
          [TIGHT]: { '& .MuiChip-label': visuallyHidden, '& .MuiChip-root': { px: '9px' } },
        }}
      >
        <SyncStatus />
      </Box>
      <SearchCircle size={46} />
      <ScansCircle current={currentOf(SCANS_DESTINATION.path)} size={46} />
      <AskAiPill current={currentOf(tabByKey('ai').path)} />
      <AvatarLink current={currentOf(SETTINGS_DESTINATION.path)} size={46} />
    </>
  ) : (
    <>
      {showBack ? (
        <ButtonBase aria-label="Back" onClick={back} sx={circle(44)}>
          <ArrowBackRounded aria-hidden sx={{ fontSize: 22 }} />
        </ButtonBase>
      ) : (
        <LogoLink size={44} />
      )}
      <Box sx={{ flex: 1 }} />
      <Box
        sx={{
          display: 'contents',
          [PHONE_NARROW]: { '& .MuiChip-label': visuallyHidden, '& .MuiChip-root': { px: '9px' } },
        }}
      >
        <SyncStatus />
      </Box>
      <SearchCircle size={44} />
      <ScansCircle current={currentOf(SCANS_DESTINATION.path)} size={44} />
      <AvatarLink current={currentOf(SETTINGS_DESTINATION.path)} size={44} />
    </>
  )
  return (
    <Box
      component="header"
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 'appBar',
        pt: safeArea.top,
        color: summit.onSky.text,
        displayPrint: 'none',
      }}
    >
      <LoadingLine />
      <Box
        sx={{
          ...shellColumnSx,
          display: 'flex',
          alignItems: 'center',
          gap: wide ? '16px' : '10px',
          py: wide ? '22px' : '14px',
          minHeight: size,
          // README §6: the nav falls in (26 px down, 900 ms) when the app opens; a cross-fade under reduced motion.
          opacity: entered ? 1 : 0,
          transform: entered ? 'none' : `translateY(-${motion.rise}px)`,
          transition: reduced
            ? 'none'
            : `opacity ${motion.duration.nav}ms ${enterEasing()}, transform ${motion.duration.nav}ms ${enterEasing()}`,
          animation: reducedEntrance(0, reduced),
        }}
      >
        {row}
      </Box>
    </Box>
  )
}
