// Owns: the monthly strip — one row per pose, one cell per month (that month's latest photo, or an empty cell), oldest
// on the left, scrolled to the latest month. The strip scrolls sideways inside its card; the page never does.
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import type { Pose, ProgressPhoto } from '@fitness/shared/schemas'
import { useEffect, useRef } from 'react'
import { cardSurface, dashedSurface } from '../../../components'
import { tokens } from '../../../theme'
import { POSE_LABEL } from './data'
import { monthLabel, monthlyStrip } from './grouping'
import { PhotoImage, TrendWeight } from './PhotoParts'

const CELL_WIDTH = 104

export function MonthlyStrip({ photos, poses, onOpen }: { photos: readonly ProgressPhoto[]; poses: readonly Pose[]; onOpen: (photo: ProgressPhoto) => void }) {
  const rows = monthlyStrip(photos, poses)
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [photos.length, poses.length])

  return (
    <Box
      ref={scroller}
      data-testid="photo-monthly-strip"
      sx={{ ...cardSurface, overflowX: 'auto', px: `${tokens.pad.card.x}px`, py: `${tokens.pad.card.y}px` }}
    >
      <Box sx={{ display: 'grid', gap: 5, width: 'max-content' }}>
        {rows.map((row) => (
          <Box key={row.pose}>
            <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.heading, color: tokens.ink.text, mb: 2, position: 'sticky', left: 0, width: 'max-content' }}>
              {POSE_LABEL[row.pose]}
            </Box>
            <Box sx={{ display: 'flex', gap: 3 }}>
              {row.cells.map(({ month, photo }) => (
                <Box key={month} sx={{ width: CELL_WIDTH, flex: 'none' }}>
                  {photo ? (
                    <ButtonBase onClick={() => onOpen(photo)} aria-label={`Open ${row.pose} photo from ${photo.date}`} sx={{ display: 'block', width: '100%', borderRadius: `${tokens.radius.control}px` }}>
                      <Box sx={{ aspectRatio: '3 / 4', borderRadius: `${tokens.radius.control}px`, overflow: 'hidden', border: `1px solid ${tokens.ink.border}`, bgcolor: tokens.ink.fill }}>
                        <PhotoImage photo={photo} />
                      </Box>
                    </ButtonBase>
                  ) : (
                    <Box
                      aria-label={`No ${row.pose} photo in ${monthLabel(month)}`}
                      sx={{ ...dashedSurface, aspectRatio: '3 / 4', borderRadius: `${tokens.radius.control}px`, display: 'grid', placeItems: 'center', color: tokens.ink.secondary, fontSize: tokens.font.size.small }}
                    >
                      —
                    </Box>
                  )}
                  <Box sx={{ pt: '6px', fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.caption, display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <Box component="span" sx={{ color: tokens.ink.text, fontWeight: tokens.font.weight.label }}>
                      {monthLabel(month, 'short')}
                    </Box>
                    {photo && <TrendWeight kg={photo.weight_kg} size={12} />}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
