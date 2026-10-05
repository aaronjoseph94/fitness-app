// Owns: the sticky bottom navigation — five tabs, filled icon and dark ink for the active one (colour stays for data),
// tapping the active tab scrolls back to the top, padded for the iOS home indicator.
import BottomNavigation from '@mui/material/BottomNavigation'
import BottomNavigationAction from '@mui/material/BottomNavigationAction'
import Box from '@mui/material/Box'
import { Link } from 'react-router'
import { tokens } from '../../../theme'
import type { TabKey } from '../../ui-store'
import { TABS } from '../tabs'
import { safeArea } from './layout'

export function BottomTabs({ active }: { active: TabKey | undefined }) {
  return (
    <Box
      component="nav"
      aria-label="Main"
      sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 'appBar', bgcolor: 'background.paper', pb: safeArea.bottom, displayPrint: 'none' }}
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
              onClick={selected ? () => window.scrollTo({ top: 0, behavior: 'smooth' }) : undefined}
              sx={{
                color: 'text.secondary',
                '&.Mui-selected': { color: 'text.primary' },
                '& .MuiBottomNavigationAction-label, & .MuiBottomNavigationAction-label.Mui-selected': {
                  fontSize: tokens.font.size.label,
                  fontWeight: selected ? tokens.font.weight.heading : tokens.font.weight.label,
                },
              }}
            />
          )
        })}
      </BottomNavigation>
    </Box>
  )
}
