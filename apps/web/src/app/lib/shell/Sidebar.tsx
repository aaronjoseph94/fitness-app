// Owns: the desktop sidebar (2a, from `md` up; a phone uses the bottom tabs instead, so the two navigations are never
// on screen together) — the brand row, the "Overview" group (the six tabs), the "Body" group, Settings below a
// divider, and the account block with the sync state. It collapses to a 76 px icon rail (the header's toggle), where
// each item keeps its name for assistive tech and in a tooltip.
//
// The selected destination is marked the 2a way: an `ink.fill` background with a 1 px inset `ink.border` ring, ink
// text at 600 and the filled glyph — not colour alone (WCAG 1.4.1) — and `aria-current="page"`. On a page below a
// section (a session under Train, a scan under Scans) the section's item keeps the mark with `aria-current="true"`: it
// is where the page lives, not the page itself.
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Tooltip from '@mui/material/Tooltip'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { visuallyHidden } from '../../../components'
import { tokens, transitionOf } from '../../../theme'
import { BODY_DESTINATIONS, SETTINGS_DESTINATION, TABS, type Destination } from '../tabs'
import { BrandTile } from './BrandTile'
import { APP_NAME } from '../../brand'
import { navInset, safeArea } from './layout'
import { AccountStatus } from './SyncStatus'

export const SIDEBAR_ID = 'app-sidebar'

/** How an item relates to the page on screen: it is the page, it holds the page, or neither. */
type Current = 'page' | 'section' | null

function NavItem({
  destination,
  current,
  collapsed,
}: {
  destination: Destination
  current: Current
  collapsed: boolean
}) {
  const active = current !== null
  const Icon = active ? destination.ActiveIcon : destination.Icon
  const item = (
    <ButtonBase
      component={Link}
      to={destination.path}
      data-testid={destination.testId}
      aria-current={current === 'page' ? 'page' : current === 'section' ? 'true' : undefined}
      sx={{
        width: '100%',
        height: 36,
        px: '10px',
        gap: '10px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: `${tokens.radius.control}px`,
        fontSize: tokens.font.size.body,
        lineHeight: tokens.font.leading.body,
        fontWeight: active ? tokens.font.weight.heading : tokens.font.weight.label,
        color: active ? tokens.ink.text : tokens.ink.body,
        bgcolor: active ? tokens.ink.fill : 'transparent',
        boxShadow: active ? `inset 0 0 0 1px ${tokens.ink.border}` : 'none',
        transition: transitionOf(['background-color', 'color'], tokens.motion.duration.fast),
        '&:hover': { bgcolor: tokens.ink.fill, color: tokens.ink.text },
      }}
    >
      <Icon aria-hidden sx={{ fontSize: 18, flex: 'none' }} />
      <Box
        component="span"
        sx={
          collapsed
            ? visuallyHidden
            : {
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textAlign: 'left',
              }
        }
      >
        {destination.title}
      </Box>
    </ButtonBase>
  )
  return (
    <li>
      {collapsed ? (
        // The rail shows only the glyph: the tooltip shows the name its link already carries.
        <Tooltip title={destination.title} placement="right">
          {item}
        </Tooltip>
      ) : (
        item
      )}
    </li>
  )
}

function Group({
  id,
  label,
  collapsed,
  first,
  children,
}: {
  id: string
  label: string
  collapsed: boolean
  first?: boolean
  children: ReactNode
}) {
  return (
    <>
      <Box
        id={id}
        sx={
          collapsed
            ? visuallyHidden
            : {
                px: 2,
                pt: first ? 0 : '18px',
                pb: '6px',
                fontSize: tokens.font.size.micro,
                fontWeight: tokens.font.weight.heading,
                lineHeight: tokens.font.leading.micro,
                letterSpacing: tokens.font.em.micro,
                textTransform: 'uppercase',
                // 2a draws these `ink.faint` (2.56:1); `ink.muted` keeps a group's name readable (4.63:1 on the panel).
                color: tokens.ink.muted,
              }
        }
      >
        {label}
      </Box>
      <Box
        component="ul"
        aria-labelledby={id}
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          display: 'grid',
          gap: '2px',
          ...(collapsed && !first && { mt: 3 }),
        }}
      >
        {children}
      </Box>
    </>
  )
}

interface SidebarProps {
  collapsed: boolean
  /** The path of the page on screen, and of the section it sits under (the first step of its trail), if any. */
  pagePath: string
  sectionPath: string | undefined
}

export function Sidebar({ collapsed, pagePath, sectionPath }: SidebarProps) {
  const currentOf = (path: string): Current =>
    path === pagePath ? 'page' : path === sectionPath ? 'section' : null
  return (
    // An `aside`, as 2a marks it up, so the brand row and the account block sit in a landmark too.
    <Box
      component="aside"
      aria-label="Sidebar"
      id={SIDEBAR_ID}
      data-testid="nav-rail"
      sx={{
        position: 'fixed',
        top: 0,
        bottom: 0,
        left: 0,
        width: navInset,
        zIndex: 'appBar',
        displayPrint: 'none',
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'hidden',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        pt: `calc(14px + ${safeArea.top})`,
        pb: `calc(14px + ${safeArea.bottom})`,
        px: 3,
        bgcolor: tokens.ink.panel,
        borderRight: `1px solid ${tokens.ink.border}`,
      }}
    >
      <Box
        component={Link}
        to="/"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: '10px',
          p: collapsed ? '6px 0 16px' : '6px 8px 16px',
          color: tokens.ink.text,
          borderRadius: `${tokens.radius.control}px`,
          '&:focus-visible': {
            outline: `${tokens.focusRing.width}px solid ${tokens.focusRing.color}`,
            outlineOffset: -tokens.focusRing.width,
          },
        }}
      >
        <BrandTile />
        {/* One line at 13 px: the full name fits the 240 px sidebar beside the tile; the ellipsis is a safety net only. */}
        <Box
          sx={
            collapsed
              ? visuallyHidden
              : {
                  flex: 1,
                  minWidth: 0,
                  fontSize: tokens.font.size.small,
                  fontWeight: tokens.font.weight.heading,
                  lineHeight: 1.2,
                  letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }
          }
        >
          {APP_NAME}
        </Box>
      </Box>

      <Box component="nav" aria-label="Main">
        <Group id="sidebar-overview" label="Overview" collapsed={collapsed} first>
          {TABS.map((tab) => (
            <NavItem key={tab.key} destination={tab} current={currentOf(tab.path)} collapsed={collapsed} />
          ))}
        </Group>
        <Group id="sidebar-body" label="Body" collapsed={collapsed}>
          {BODY_DESTINATIONS.map((d) => (
            <NavItem key={d.path} destination={d} current={currentOf(d.path)} collapsed={collapsed} />
          ))}
        </Group>
        <Box aria-hidden sx={{ mx: collapsed ? 0 : 2, mt: 4, borderTop: `1px solid ${tokens.ink.border}` }} />
        <Box component="ul" sx={{ listStyle: 'none', m: 0, mt: '10px', p: 0 }}>
          <NavItem
            destination={SETTINGS_DESTINATION}
            current={currentOf(SETTINGS_DESTINATION.path)}
            collapsed={collapsed}
          />
        </Box>
      </Box>

      <AccountStatus collapsed={collapsed} />
    </Box>
  )
}
