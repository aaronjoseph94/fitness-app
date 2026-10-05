// Owns: the grid view — photos by date, grouped by month (newest first), three across on a phone and more on wider
// screens; tapping a photo opens it.
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import type { ProgressPhoto } from '@fitness/shared/schemas'
import { tokens } from '../../../theme'
import { groupByMonth, monthLabel } from './grouping'
import { PhotoFacts, PhotoImage } from './PhotoParts'

export function PhotoGrid({ photos, onOpen, showPose }: { photos: readonly ProgressPhoto[]; onOpen: (photo: ProgressPhoto) => void; showPose: boolean }) {
  return (
    <Box data-testid="photo-grid" sx={{ display: 'grid', gap: 5 }}>
      {groupByMonth(photos).map((group) => (
        <Box component="section" key={group.month} aria-label={monthLabel(group.month)}>
          <Box component="h2" sx={{ m: 0, mb: 2, fontSize: 15, fontWeight: tokens.font.weight.heading, color: tokens.ink.text }}>
            {monthLabel(group.month)}
            <Box component="span" sx={{ ml: 2, fontWeight: tokens.font.weight.body, color: tokens.ink.secondary, fontSize: 13 }}>
              {group.photos.length} {group.photos.length === 1 ? 'photo' : 'photos'}
            </Box>
          </Box>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))', md: 'repeat(6, minmax(0, 1fr))' } }}>
            {group.photos.map((photo) => (
              <ButtonBase
                key={photo.id}
                onClick={() => onOpen(photo)}
                aria-label={`Open ${photo.pose} photo from ${photo.date}`}
                sx={{ display: 'block', textAlign: 'left', borderRadius: tokens.radius.control, minWidth: 0 }}
              >
                <Box sx={{ aspectRatio: '3 / 4', borderRadius: `${tokens.radius.control}px`, overflow: 'hidden', border: `1px solid ${tokens.ink.border}` }}>
                  <PhotoImage photo={photo} />
                </Box>
                <PhotoFacts photo={photo} showPose={showPose} compact />
              </ButtonBase>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  )
}
