// Owns: the floating quick-log button (Today and Log) — above the bottom nav and the home indicator, aligned to the
// content column's right edge, stepping out into the gutter beside it once the window is wide enough that the edge
// would otherwise mean floating over the cards — which opens the quick-log sheet (and starts loading its code as a
// press approaches).
import Add from '@mui/icons-material/Add'
import Box from '@mui/material/Box'
import Fab from '@mui/material/Fab'
import { tokens } from '../../../theme'
import { useUiStore } from '../../ui-store'
import type { PageWidth } from '../route-handle'
import { columnSx, FAB_SIZE, railInset, safeArea } from './layout'
import { preloadQuickLog } from './QuickLogHost'

export function QuickLogFab({ width }: { width: PageWidth }) {
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  return (
    <Box
      sx={{
        // This layer spans the window, so it needs the rail's footprint itself; the phone keeps the clearance the bottom
        // nav needs, the desktop only what the home indicator needs.
        ...railInset,
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: { xs: `calc(${tokens.layout.bottomNavHeight + tokens.space(4)}px + ${safeArea.bottom})`, md: `calc(${tokens.space(6)}px + ${safeArea.bottom})` },
        zIndex: 'speedDial',
        pointerEvents: 'none',
        displayPrint: 'none',
      }}
    >
      <Box sx={{ ...columnSx(width), display: 'flex', justifyContent: 'flex-end' }}>
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
            bgcolor: 'text.primary',
            color: 'background.paper',
            // The one genuinely floating control in the app: it lifts on a neutral shadow (never a coloured glow,
            // which reads as decoration) and answers a press with a small scale, instantly, on pointer-down.
            boxShadow: tokens.elevation.floating,
            transition: `transform ${tokens.motion.duration.instant}ms ${tokens.motion.easing.standard}, box-shadow ${tokens.motion.duration.fast}ms ${tokens.motion.easing.standard}`,
            '&:hover': { bgcolor: 'text.primary' },
            '&:active': { transform: 'scale(0.96)' },
            '@media (prefers-reduced-motion: reduce)': { '&:active': { transform: 'none' } },
            // The button is aligned to the content column's right edge, so on a wide page it sits over the last column
            // of cards. Once the gutter beside that column is wide enough to hold it, it steps out so nothing is ever
            // covered: 1120 px of content + this button and its clearance is ≈ 1232 px, plus the 76 px rail it sits
            // beside. Below that — which is every phone — the gutter is just the safe-area padding and it does not move.
            '@media (min-width: 1308px)': { mr: `-${FAB_SIZE + tokens.space(3)}px` },
          }}
        >
          <Add />
        </Fab>
      </Box>
    </Box>
  )
}
