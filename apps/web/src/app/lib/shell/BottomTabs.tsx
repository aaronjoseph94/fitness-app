// Owns: the sticky bottom navigation — the phone's navigation (from `md` up the desktop rail replaces it, so the two
// are never both on screen) — six tabs, a filled icon and the accent tint for the active one, tapping the active tab
// scrolls back to the top, padded for the iOS home indicator.
//
// Rebuilt on the HIG's tab bar: a translucent material the page scrolls under, no hairline separator while the page is
// at rest (the material itself is the edge), the scroll edge effect once content passes beneath it, and the selected
// item tinted the way the platform tints it — with the filled glyph as the second, non-colour signal (WCAG 1.4.1).
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import Box from '@mui/material/Box'
import { Link } from 'react-router'
import { chromeSurface, scrollBehavior, tokens, transitionOf } from '../../../theme'
import type { TabKey } from '../../ui-store'
import { TABS } from '../tabs'
import { safeArea } from './layout'
import { useScrolled } from './useScrolled'

export function BottomTabs({ active }: { active: TabKey | undefined }) {
  const scrolled = useScrolled()
  return (
    <Box
      component="nav"
      aria-label="Main"
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 'appBar',
        ...chromeSurface,
        pb: safeArea.bottom,
        // The scroll edge effect: the separator only exists while there is something under the bar to separate from.
        boxShadow: scrolled ? `0 -1px 0 0 ${tokens.ink.border}` : 'none',
        transition: transitionOf('box-shadow', tokens.motion.duration.fast),
        // The rail is the navigation from `md` up; hiding this one removes it from the accessibility tree too.
        display: { xs: 'block', md: 'none' },
        displayPrint: 'none',
      }}
    >
      <BottomNavigation showLabels value={active ?? false}>
        {TABS.map((tab) => {
          const selected = tab.key === active
          const Icon = selected ? tab.ActiveIcon : tab.Icon
          return (
            <BottomNavigationAction
              key={tab.key}
              value={tab.key}
              label={tab.label}
              icon={<Icon />}
              component={Link}
              to={tab.path}
              aria-current={selected ? 'page' : undefined}
              onClick={selected ? () => window.scrollTo({ top: 0, behavior: scrollBehavior() }) : undefined}
            />
          )
        })}
      </BottomNavigation>
    </Box>
  )
}
