// Owns: the desktop navigation rail — the fixed icon strip down the left edge from `md` up, where a phone uses the
// bottom tabs instead (so the two navigations are never on screen at once, and neither is duplicated for a screen
// reader: the rail is `display: none` on a phone and the bottom bar is `display: none` on a desktop).
//
// Rebuilt on the HIG's sidebar: a translucent material the page scrolls under (not an opaque strip with a full-height
// hairline), and the selected destination marked the way the platform marks it — an accent-tinted rounded tile with an
// accent glyph. That is not colour alone (WCAG 1.4.1): the glyph itself changes from outline to filled and the tile
// carries a surface, and `aria-current="page"` names it for assistive tech. `accent.deep` on `accent.soft` measures
// 6.34:1, better than the white-on-gradient it replaced (which was 3.68:1, the minimum for a graphic).
import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { Link } from 'react-router'
import { chromeSurface, tokens, transitionOf, withAlpha } from '../../../theme'
import type { TabKey } from '../../ui-store'
import { TABS, type Tab } from '../tabs'
import { safeArea } from './layout'
import { useScrolled } from './useScrolled'

/** The tile's edge, in px: a 48 px target with the icon comfortably inside it. */
const TILE = 48

function RailLink({ tab, active }: { tab: Tab; active: boolean }) {
  const Icon = active ? tab.ActiveIcon : tab.Icon
  return (
    <Tooltip title={tab.title} placement="right" arrow>
      <ButtonBase
        component={Link}
        to={tab.path}
        data-testid={`rail-${tab.key}`}
        aria-current={active ? 'page' : undefined}
        sx={{
          width: TILE,
          height: TILE,
          flex: 'none',
          display: 'grid',
          placeItems: 'center',
          borderRadius: `${tokens.radius.control}px`,
          color: active ? tokens.accent.deep : tokens.ink.secondary,
          backgroundColor: active ? tokens.accent.soft : 'transparent',
          transition: transitionOf(['background-color', 'color', 'transform'], tokens.motion.duration.fast),
          '@media (hover: hover)': {
            '&:hover': { backgroundColor: active ? tokens.accent.soft : withAlpha(tokens.ink.text, 0.06), color: active ? tokens.accent.deep : tokens.ink.text },
          },
          '&:active': { transform: 'scale(0.94)' },
          '@media (prefers-reduced-motion: reduce)': { '&:active': { transform: 'none' } },
        }}
      >
        <Icon sx={{ fontSize: 22 }} />
      </ButtonBase>
    </Tooltip>
  )
}

export function NavRail({ active }: { active: TabKey | undefined }) {
  const scrolled = useScrolled()
  return (
    <Box
      component="nav"
      aria-label="Main"
      data-testid="nav-rail"
      sx={{
        position: 'fixed',
        top: 0,
        bottom: 0,
        left: 0,
        width: tokens.layout.railWidth,
        zIndex: 'appBar',
        display: { xs: 'none', md: 'flex' },
        displayPrint: 'none',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        pt: `calc(${tokens.space(4)}px + ${safeArea.top})`,
        pb: `calc(${tokens.space(4)}px + ${safeArea.bottom})`,
        ...chromeSurface,
        // The same scroll edge effect as the top bar: the hairline exists only while content is beside the rail.
        boxShadow: scrolled ? `1px 0 0 0 ${tokens.ink.border}` : 'none',
        transition: transitionOf('box-shadow', tokens.motion.duration.fast),
      }}
    >
      {TABS.map((tab) => (
        <RailLink key={tab.key} tab={tab} active={tab.key === active} />
      ))}

      <Box sx={{ flex: 1, minHeight: 2 }} />

      <Tooltip title="Settings" placement="right" arrow>
        <IconButton
          component={Link}
          to="/settings"
          aria-label="Settings"
          data-testid="rail-settings"
          sx={{
            width: TILE,
            height: TILE,
            color: tokens.ink.secondary,
            '@media (hover: hover)': { '&:hover': { bgcolor: withAlpha(tokens.ink.text, 0.06), color: tokens.ink.text } },
          }}
        >
          <SettingsOutlined sx={{ fontSize: 22 }} />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
