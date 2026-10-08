// Owns: the floating quick-log button on a phone (Today and Log) — above the bottom nav and the home indicator,
// aligned to the content column's right edge — which opens the quick-log sheet (and starts loading its code as a press
// approaches). From `md` up those pages carry their own "Log" button in the title row instead (2a), so the shell does
// not float one over the cards.
import Add from '@mui/icons-material/Add'
import Box from '@mui/material/Box'
import Fab from '@mui/material/Fab'
import { tokens } from '../../../theme'
import { useUiStore } from '../../ui-store'
import type { PageWidth } from '../route-handle'
import { pageWidthSx, safeArea, shellColumnSx } from './layout'
import { preloadQuickLog } from './QuickLogHost'

export function QuickLogFab({ width }: { width: PageWidth }) {
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  return (
    <Box
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: `calc(${tokens.layout.bottomNavHeight + tokens.space(4)}px + ${safeArea.bottom})`,
        zIndex: 'speedDial',
        pointerEvents: 'none',
        displayPrint: 'none',
      }}
    >
      <Box sx={shellColumnSx}>
        <Box sx={{ ...pageWidthSx(width), display: 'flex', justifyContent: 'flex-end' }}>
          <Fab
            aria-label="Quick log"
            data-testid="quick-log-fab"
            onClick={() => openQuickLog()}
            // The sheet's code loads on first open; start it as the finger or pointer arrives.
            onPointerEnter={preloadQuickLog}
            onPointerDown={preloadQuickLog}
            onFocus={preloadQuickLog}
            sx={{
              pointerEvents: 'auto',
              // 2a's dark surface and its one floating shadow (shared with the session's rest timer): a neutral lift,
              // never a coloured glow, and an instant small scale on pointer-down.
              bgcolor: tokens.dark.bg,
              color: tokens.dark.text,
              boxShadow: tokens.elevation.floating,
              transition: `background-color ${tokens.motion.duration.fast}ms ${tokens.motion.easing.standard}, transform ${tokens.motion.duration.instant}ms ${tokens.motion.easing.standard}`,
              '&:hover': { bgcolor: tokens.dark.hover },
              '&:active': { transform: 'scale(0.96)', boxShadow: tokens.elevation.floating },
              '@media (prefers-reduced-motion: reduce)': { '&:active': { transform: 'none' } },
            }}
          >
            <Add />
          </Fab>
        </Box>
      </Box>
    </Box>
  )
}
