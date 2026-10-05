// Owns: the monthly strip — one row per pose, one cell per month (that month's latest photo, or an empty cell), oldest
// on the left, scrolled to the latest month. The strip scrolls sideways inside its card; the page never does.
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import type { Pose, ProgressPhoto } from '@fitness/shared/schemas'
import { useEffect, useRef } from 'react'
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
      sx={{ overflowX: 'auto', border: `1px solid ${tokens.ink.border}`, borderRadius: `${tokens.radius.card}px`, bgcolor: tokens.ink.card, p: 3 }}
    >
      <Box sx={{ display: 'grid', gap: 3, width: 'max-content' }}>
        {rows.map((row) => (
          <Box key={row.pose}>
            <Box sx={{ fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: tokens.ink.secondary, mb: 1.5, position: 'sticky', left: 0, width: 'max-content' }}>
              {POSE_LABEL[row.pose]}
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              {row.cells.map(({ month, photo }) => (
                <Box key={month} sx={{ width: CELL_WIDTH, flex: 'none' }}>
                  {photo ? (
                    <ButtonBase onClick={() => onOpen(photo)} aria-label={`Open ${row.pose} photo from ${photo.date}`} sx={{ display: 'block', width: '100%', borderRadius: `${tokens.radius.control}px` }}>
                      <Box sx={{ aspectRatio: '3 / 4', borderRadius: `${tokens.radius.control}px`, overflow: 'hidden' }}>
                        <PhotoImage photo={photo} />
                      </Box>
                    </ButtonBase>
                  ) : (
                    <Box
                      aria-label={`No ${row.pose} photo in ${monthLabel(month)}`}
                      sx={{ aspectRatio: '3 / 4', borderRadius: `${tokens.radius.control}px`, border: `1px dashed ${tokens.ink.border}`, display: 'grid', placeItems: 'center', color: tokens.ink.secondary, fontSize: tokens.font.size.label }}
                    >
                      —
                    </Box>
                  )}
                  <Box sx={{ pt: 1, fontSize: tokens.font.size.caption, lineHeight: 1.35, display: 'flex', justifyContent: 'space-between', gap: 1 }}>
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
