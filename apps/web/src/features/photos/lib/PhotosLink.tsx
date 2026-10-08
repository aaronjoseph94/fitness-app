// Owns: the compact "Progress photos" card other pages drop in (the Progress tab): the latest photo, how many there
// are and when the last was taken; the whole card opens /photos (or /photos/new when there are none yet).
import ChevronRight from '@mui/icons-material/ChevronRight'
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import { Link as RouterLink } from 'react-router'
import { cardSurface, formatShortDate } from '../../../components'
import { tokens, transitionOf } from '../../../theme'
import { POSE_LABEL, usePhotos } from './data'
import { PhotoImage, TrendWeight } from './PhotoParts'

export function PhotosLink() {
  const { data } = usePhotos()
  const latest = data?.[0]
  const count = data?.length ?? 0
  return (
    <ButtonBase
      component={RouterLink}
      to={latest ? '/photos' : '/photos/new'}
      data-testid="photos-link"
      sx={{
        ...cardSurface,
        width: '100%',
        display: 'flex',
        justifyContent: 'flex-start',
        textAlign: 'left',
        alignItems: 'center',
        gap: '14px',
        px: '16px',
        py: '14px',
        color: 'inherit',
        textDecoration: 'none',
        transition: transitionOf(['background-color'], tokens.motion.duration.fast),
        '&:hover': { bgcolor: tokens.ink.panel },
      }}
    >
      <Box sx={{ width: 36, height: 48, flex: 'none', borderRadius: `${tokens.radius.inner}px`, overflow: 'hidden', bgcolor: tokens.ink.fill, display: 'grid', placeItems: 'center' }}>
        {latest ? <PhotoImage photo={latest} /> : <PhotoCameraOutlined sx={{ fontSize: 18, color: tokens.accent.main }} />}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontWeight: tokens.font.weight.heading, fontSize: tokens.font.size.body, lineHeight: tokens.font.leading.body, color: tokens.ink.text }}>Progress photos</Box>
        <Box sx={{ fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.caption, color: tokens.ink.secondary, display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {latest ? (
            <>
              {count} {count === 1 ? 'photo' : 'photos'} · last {POSE_LABEL[latest.pose].toLowerCase()} {formatShortDate(latest.date)}
              <TrendWeight kg={latest.weight_kg} size={tokens.font.size.caption} />
            </>
          ) : (
            'Front, side and back, private, never sent to any AI'
          )}
        </Box>
      </Box>
      <ChevronRight aria-hidden sx={{ fontSize: 18, color: tokens.ink.faint }} />
    </ButtonBase>
  )
}
