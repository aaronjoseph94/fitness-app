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
import { columnSx, FAB_SIZE, safeArea } from './layout'
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
            '&, &:hover, &:active': { boxShadow: 'none' },
            '&:hover': { bgcolor: 'text.primary' },
            // The button is aligned to the content column's right edge, so on a wide page it sits over the last column
            // of cards. From 1280 px the gutter beside that column is wide enough to hold it, and it steps out into the
            // gutter so nothing is ever covered (1120 px of content + this button and its clearance ≈ 1232 px). Below
            // that — which is every phone — the gutter is just the safe-area padding and the button does not move.
            '@media (min-width: 1280px)': { mr: `-${FAB_SIZE + tokens.space(3)}px` },
          }}
        >
          <Add />
        </Fab>
      </Box>
    </Box>
  )
}
