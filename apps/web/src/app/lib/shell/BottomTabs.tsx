// Owns: the bottom navigation — the phone's navigation (from `md` up the desktop sidebar replaces it, so the two are
// never both on screen) — six tabs, the filled glyph and the accent for the active one, tapping the active tab scrolls
// back to the top, padded for the iOS home indicator.
//
// 2a's chrome: an opaque white bar with the `ink.border` hairline above it, the same edge the desktop header draws. The
// selected tab is tinted and takes the filled glyph, the second, non-colour signal (WCAG 1.4.1), and `aria-current`.
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import Box from '@mui/material/Box'
import { Link } from 'react-router'
import { scrollBehavior, tokens } from '../../../theme'
import type { TabKey } from '../../ui-store'
import { TABS } from '../tabs'
import { safeArea } from './layout'

export function BottomTabs({ active }: { active: TabKey | undefined }) {
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
        pb: safeArea.bottom,
        bgcolor: tokens.ink.card,
        borderTop: `1px solid ${tokens.ink.border}`,
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
              sx={{
                '&.Mui-selected .MuiBottomNavigationAction-label': { fontWeight: tokens.font.weight.heading },
              }}
            />
          )
        })}
      </BottomNavigation>
    </Box>
  )
}
