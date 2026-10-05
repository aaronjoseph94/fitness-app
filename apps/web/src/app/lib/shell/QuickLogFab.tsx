// Owns: the floating quick-log button (Today and Log) — above the bottom nav and the home indicator, aligned to the
// content column's right edge — which opens the quick-log sheet.
import Add from '@mui/icons-material/Add'
import Box from '@mui/material/Box'
import Fab from '@mui/material/Fab'
import { tokens } from '../../../theme'
import { useUiStore } from '../../ui-store'
import type { PageWidth } from '../route-handle'
import { columnSx, safeArea } from './layout'

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
          sx={{
            pointerEvents: 'auto',
            bgcolor: 'text.primary',
            color: 'background.paper',
            '&, &:hover, &:active': { boxShadow: 'none' },
            '&:hover': { bgcolor: 'text.primary' },
          }}
        >
          <Add />
        </Fab>
      </Box>
    </Box>
  )
}
