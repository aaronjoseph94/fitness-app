// Owns: the grid view — photos by date, grouped by month (newest first), three across on a phone and more on wider
// screens; tapping a photo opens it.
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import type { ProgressPhoto } from '@fitness/shared/schemas'
import { SectionHeader } from '../../../components'
import { tokens } from '../../../theme'
import { groupByMonth, monthLabel } from './grouping'
import { PhotoFacts, PhotoImage } from './PhotoParts'

export function PhotoGrid({ photos, onOpen, showPose }: { photos: readonly ProgressPhoto[]; onOpen: (photo: ProgressPhoto) => void; showPose: boolean }) {
  return (
    <Box data-testid="photo-grid" sx={{ display: 'grid', gap: `${tokens.rhythm.section}px` }}>
      {groupByMonth(photos).map((group) => (
        <Box component="section" key={group.month} aria-label={monthLabel(group.month)}>
          <SectionHeader title={monthLabel(group.month)} subtitle={`${group.photos.length} ${group.photos.length === 1 ? 'photo' : 'photos'}`} />
          <Box sx={{ display: 'grid', columnGap: 3, rowGap: 4, gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' } }}>
            {group.photos.map((photo) => (
              <ButtonBase
                key={photo.id}
                onClick={() => onOpen(photo)}
                aria-label={`Open ${photo.pose} photo from ${photo.date}`}
                sx={{ display: 'block', textAlign: 'left', borderRadius: `${tokens.radius.control}px`, minWidth: 0, '&:hover img': { opacity: 0.92 } }}
              >
                <Box sx={{ aspectRatio: '3 / 4', borderRadius: `${tokens.radius.control}px`, overflow: 'hidden', border: `1px solid ${tokens.ink.border}`, bgcolor: tokens.ink.fill }}>
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
