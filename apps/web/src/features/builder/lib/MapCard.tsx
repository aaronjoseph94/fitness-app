// Owns: the builder's summary card in Train's "today card" idiom (1d Summit) — a white radius-30 card whose content sits
// on the left and whose muscle map (220 px, its legend and a caption) sits in a warm well at 1fr : 260 px, the well
// wrapping under the content when the two no longer fit (README §4). Shared by the workout builder and the AI workout
// preview.
import Box from '@mui/material/Box'
import type { Muscle } from '@fitness/shared/schemas'
import type { ReactNode } from 'react'
import { cardSurface, fixedCol } from '../../../components'
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

export function MapCard({ levels, mapTitle, caption, testId, children }: MapCardProps) {
  return (
    <Box
      data-testid={testId}
      sx={{
        ...cardSurface,
        display: 'flex',
        flexWrap: 'wrap',
        gap: '26px',
        px: { xs: '22px', sm: '28px' },
        py: { xs: '22px', sm: '26px' },
        minWidth: 0,
      }}
    >
      <Box sx={{ flex: '100 1 280px', minWidth: 0 }}>{children}</Box>
      <Box
        sx={{
          ...fixedCol(260),
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          p: '18px',
          borderRadius: `${tokens.summit.radius.small}px`,
          bgcolor: tokens.ink.panel,
        }}
      >
        <MuscleMap levels={levels} size={200} title={mapTitle} />
        <MuscleMapLegend dense />
        {caption && (
          <Box
            sx={{
              fontSize: tokens.font.size.small,
              fontWeight: tokens.font.weight.body,
              lineHeight: tokens.font.leading.small,
              color: tokens.ink.secondary,
              textAlign: 'center',
            }}
          >
            {caption}
          </Box>
        )}
      </Box>
    </Box>
  )
}
