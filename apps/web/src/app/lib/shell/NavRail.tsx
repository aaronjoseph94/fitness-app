// Owns: the desktop navigation rail — the fixed icon strip down the left edge from `md` up, where a phone uses the
// bottom tabs instead (so the two navigations are never on screen at once, and neither is duplicated for a screen
// reader: the rail is `display: none` on a phone and the bottom bar is `display: none` on a desktop).
//
// The active destination is not signalled by colour alone (WCAG 1.4.1): it is a filled blue tile with a white glyph
// while the inactive ones are bare grey glyphs, and it carries `aria-current="page"`. White on the brighter end of the
// blue gradient measures 3.68:1, which clears the 3:1 floor for a graphical object (WCAG 1.4.11); the label lives in
// a tooltip and in the link's accessible name, so the glyph is never the only source of the name either.
import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import { Link } from 'react-router'
import { tokens, transitionOf } from '../../../theme'
import type { TabKey } from '../../ui-store'
import { TABS, type Tab } from '../tabs'
import { safeArea } from './layout'

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
          color: active ? tokens.ink.card : tokens.ink.secondary,
          backgroundImage: active ? `linear-gradient(135deg, ${tokens.accent.bright} 0%, ${tokens.accent.main} 100%)` : 'none',
          boxShadow: active ? tokens.elevation.accent : 'none',
          transition: transitionOf(['background-color', 'color'], tokens.motion.duration.fast),
          '@media (hover: hover)': {
            '&:hover': { backgroundColor: active ? 'transparent' : tokens.ink.sunken, color: active ? tokens.ink.card : tokens.ink.text },
          },
        }}
      >
        <Icon sx={{ fontSize: 22 }} />
      </ButtonBase>
    </Tooltip>
  )
}

export function NavRail({ active }: { active: TabKey | undefined }) {
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
        bgcolor: 'background.paper',
        borderRight: `1px solid ${tokens.ink.border}`,
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
            '@media (hover: hover)': { '&:hover': { bgcolor: tokens.ink.sunken, color: tokens.ink.text } },
          }}
        >
          <SettingsOutlined sx={{ fontSize: 22 }} />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
