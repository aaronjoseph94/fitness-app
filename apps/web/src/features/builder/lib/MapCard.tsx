// Owns: the builder's summary card in Train's "today card" idiom (2a) — a white card whose content sits on the left
// and whose right 260 px is a #FAFAFA panel holding the 200 px muscle map, its legend and a caption. On a phone the
// panel drops under the content. Shared by the workout builder and the AI workout preview.
import Box from '@mui/material/Box'
import type { Muscle } from '@fitness/shared/schemas'
import type { ReactNode } from 'react'
import { cardSurface } from '../../../components'
import { MuscleMap, MuscleMapLegend, type MuscleLevel } from '../../../muscle-map'
import { tokens } from '../../../theme'

export interface MapCardProps {
  levels: Record<Muscle, MuscleLevel>
  /** The map's accessible name. */
  mapTitle: string
  /** A 12 px muted line under the legend, e.g. the muscles trained most. */
  caption?: ReactNode
  testId?: string
  children: ReactNode
}

const INNER = tokens.radius.card - 1

export function MapCard({ levels, mapTitle, caption, testId, children }: MapCardProps) {
  return (
    <Box
      data-testid={testId}
      sx={{ ...cardSurface, display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) 260px' }, minWidth: 0 }}
    >
      <Box sx={{ minWidth: 0, px: `${tokens.pad.card.x}px`, py: `${tokens.pad.card.y}px` }}>{children}</Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          p: 4,
          bgcolor: tokens.ink.panel,
          borderLeft: { sm: `1px solid ${tokens.ink.border}` },
          borderTop: { xs: `1px solid ${tokens.ink.border}`, sm: 'none' },
          // Inside the card's 1 px border, so 1 px less than its radius.
          borderRadius: { xs: `0 0 ${INNER}px ${INNER}px`, sm: `0 ${INNER}px ${INNER}px 0` },
        }}
      >
        <MuscleMap levels={levels} size={200} title={mapTitle} />
        <MuscleMapLegend dense />
        {caption && (
          <Box sx={{ fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.caption, color: tokens.ink.secondary, textAlign: 'center' }}>{caption}</Box>
        )}
      </Box>
    </Box>
  )
}
