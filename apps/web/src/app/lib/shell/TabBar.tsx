// Owns: the phone's fixed bottom tab bar (README §3, below 960 px; the desktop nav's pill replaces it, so the two are
// never on screen together) — the six tabs as equal cells at least 52 px tall (a 22 px glyph over the short `label`)
// in a deep capsule (94 % opaque, so no blur behind it) 10 px off the edges and above the home indicator. The active cell is white with deep ink
// and the filled glyph (a second, non-colour signal — WCAG 1.4.1 — beside `aria-current`); tapping it scrolls back to
// the top. Each cell keeps its 2a `rail-*` test id; a page below a tab marks that tab with `aria-current="true"`.
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import { Link } from 'react-router'
import { skyFocus } from '../../../components'
import { scrollBehavior, tokens, transitionOf } from '../../../theme'
import { TABS } from '../tabs'
import { safeArea } from './layout'
import type { Current } from './SummitNav'

const { summit, layout, font, motion } = tokens

export function TabBar({ currentOf }: { currentOf: (path: string) => Current }) {
  return (
    <Box
      component="nav"
      aria-label="Main"
      sx={{
        position: 'fixed',
        left: layout.tabBar.inset,
        right: layout.tabBar.inset,
        bottom: `calc(${layout.tabBar.inset}px + ${safeArea.bottom})`,
        zIndex: 'appBar',
        display: 'grid',
        gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))`,
        gap: '2px',
        p: '6px',
        borderRadius: `${summit.radius.tabBar}px`,
        bgcolor: summit.tabBar.fill,
        boxShadow: summit.tabBar.shadow,
        displayPrint: 'none',
      }}
    >
      {TABS.map((tab) => {
        const current = currentOf(tab.path)
        const active = current !== null
        const Icon = active ? tab.ActiveIcon : tab.Icon
        return (
          <ButtonBase
            key={tab.key}
            component={Link}
            to={tab.path}
            data-testid={tab.testId}
            aria-current={current === 'page' ? 'page' : current === 'section' ? 'true' : undefined}
            onClick={
              current === 'page' ? () => window.scrollTo({ top: 0, behavior: scrollBehavior() }) : undefined
            }
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              minWidth: 0,
              minHeight: layout.tabBar.cell,
              borderRadius: `${summit.radius.tabCell}px`,
              bgcolor: active ? summit.tabBar.active : 'transparent',
              color: active ? summit.tabBar.activeText : summit.tabBar.text,
              fontSize: font.size.tabLabel,
              fontWeight: active ? font.weight.label : 400,
              lineHeight: 1.2,
              transition: transitionOf(['background-color', 'color'], motion.duration.fast),
              '& .MuiSvgIcon-root': { transition: transitionOf('transform', motion.duration.fast) },
              '&:active .MuiSvgIcon-root': { transform: 'scale(0.88)' },
              '@media (prefers-reduced-motion: reduce)': {
                '&:active .MuiSvgIcon-root': { transform: 'none' },
              },
              ...skyFocus,
            }}
          >
            <Icon aria-hidden sx={{ fontSize: 22 }} />
            <Box
              component="span"
              sx={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {tab.label}
            </Box>
          </ButtonBase>
        )
      })}
    </Box>
  )
}
