// Owns: the compact "Progress photos" card other pages drop in (the Progress tab): the latest photo, how many there
// are and when the last was taken; the whole card opens /photos (or /photos/new when there are none yet).
import ChevronRight from '@mui/icons-material/ChevronRight'
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import { Link as RouterLink } from 'react-router'
import { formatShortDate } from '../../../components'
import { tokens } from '../../../theme'
import { POSE_LABEL, usePhotos } from './data'
import { PhotoImage, TrendWeight } from './PhotoParts'

export function PhotosLink() {
  const { data } = usePhotos()
  const latest = data?.[0]
  const count = data?.length ?? 0
  return (
    <Card data-testid="photos-link">
      <CardActionArea component={RouterLink} to={latest ? '/photos' : '/photos/new'} sx={{ display: 'flex', alignItems: 'center', gap: 4, p: 4, justifyContent: 'flex-start' }}>
        <Box sx={{ width: 48, height: 64, flex: 'none', borderRadius: `${tokens.radius.control}px`, overflow: 'hidden', bgcolor: tokens.chart.grid, display: 'grid', placeItems: 'center' }}>
          {latest ? <PhotoImage photo={latest} /> : <PhotoCameraOutlined sx={{ color: tokens.ink.secondary }} />}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ fontWeight: tokens.font.weight.heading, fontSize: 16 }}>Progress photos</Box>
          <Box sx={{ fontSize: 13, color: tokens.ink.secondary, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            {latest ? (
              <>
                {count} {count === 1 ? 'photo' : 'photos'} · last {POSE_LABEL[latest.pose].toLowerCase()} {formatShortDate(latest.date)}
                <TrendWeight kg={latest.weight_kg} />
              </>
            ) : (
              'Front, side and back, private, never sent to any AI'
            )}
          </Box>
        </Box>
        <ChevronRight sx={{ color: tokens.ink.secondary }} />
      </CardActionArea>
    </Card>
  )
}
