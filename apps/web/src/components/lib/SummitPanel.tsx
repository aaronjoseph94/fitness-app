// Owns: `SummitPanel`, the cream panel that rides 44 px up over the sky hero (README §3) — radius 44 44 0 0, the panel
// shadow cast up onto the sky, the page gutter on both sides (content 1,328 px at most, centred; never under a landscape
// phone's safe areas) and the panel's own padding (40 top, 60 bottom). The shell puts every page's content in one; a
// page never draws its own.
import Box from '@mui/material/Box'
import type { ReactNode, Ref } from 'react'
import { tokens } from '../../theme'

const { summit, layout } = tokens

export interface SummitPanelProps {
  children?: ReactNode
  /** Extra space under the content (a CSS length), e.g. the phone's tab-bar clearance. Added to the 60 px. */
  extraBottom?: string
  ref?: Ref<HTMLDivElement>
  testId?: string
}

export function SummitPanel({ children, extraBottom, ref, testId }: SummitPanelProps) {
  return (
    <Box
      ref={ref}
      data-testid={testId}
      sx={{
        position: 'relative',
        zIndex: 1,
        flex: 1,
        mt: `-${layout.panelOverlap}px`,
        pl: `max(${layout.gutter}, env(safe-area-inset-left, 0px))`,
        pr: `max(${layout.gutter}, env(safe-area-inset-right, 0px))`,
        pt: `${layout.mainPadding.top}px`,
        pb: extraBottom
          ? `calc(${layout.mainPadding.bottom}px + ${extraBottom})`
          : `${layout.mainPadding.bottom}px`,
        borderRadius: `${summit.radius.hero}px ${summit.radius.hero}px 0 0`,
        bgcolor: summit.surface.page,
        boxShadow: summit.panel.shadow,
        minWidth: 0,
        '@media print': { mt: 0, px: 0, pt: 0, boxShadow: 'none', borderRadius: 0 },
      }}
    >
      {children}
    </Box>
  )
}
