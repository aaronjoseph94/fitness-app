// Owns: the Log tab's rail card (1d Summit) — a white radius-30 card, or the deep-sky card (the screen's one plan-level
// card: fasting), with an Outfit 17 title led by an optional 22 px glyph and a short meta line or control on the right
// that wraps under the title when the rail is narrow (Water, Sleep and steps, Measurements, Fasting, Favourites) — and
// the loading rows.
import Box from '@mui/material/Box'
import Skeleton from '@mui/material/Skeleton'
import type SvgIcon from '@mui/material/SvgIcon'
import type { ReactNode } from 'react'
import { cardSurface, deepSkySurface, displayTitle } from '../../../components'
import { tokens } from '../../../theme'

const { summit } = tokens

interface LogCardProps {
  title: string
  icon?: typeof SvgIcon
  /** The glyph's token colour (a metric's, or the muted ink). */
  iconColor?: string
  /** Right of the title: a 13 px meta line, a chip, a link button. */
  meta?: ReactNode
  /** `card` (white, default) or `deep` (the deep-sky card, white text). */
  tone?: 'card' | 'deep'
  children: ReactNode
  testId?: string
}

export function LogCard({
  title,
  icon: Icon,
  iconColor = tokens.ink.secondary,
  meta,
  tone = 'card',
  children,
  testId,
}: LogCardProps) {
  const deep = tone === 'deep'
  return (
    <Box
      component="section"
      data-testid={testId}
      sx={{
        ...(deep ? deepSkySurface : cardSurface),
        position: 'relative',
        overflow: 'hidden',
        minWidth: 0,
        px: '24px',
        py: '22px',
        breakInside: 'avoid',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 8px', minWidth: 0 }}>
        {Icon && <Icon aria-hidden sx={{ fontSize: 22, color: iconColor, flex: 'none' }} />}
        <Box
          component="h2"
          sx={{
            m: 0,
            flex: '1 1 auto',
            minWidth: 0,
            ...displayTitle('card'),
            fontSize: 17,
            color: deep ? summit.deepSky.text : tokens.ink.text,
          }}
        >
          {title}
        </Box>
        {meta && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '6px 8px',
              minWidth: 0,
              fontSize: tokens.font.size.small,
              fontWeight: tokens.font.weight.body,
              color: deep ? summit.deepSky.muted : tokens.ink.secondary,
            }}
          >
            {meta}
          </Box>
        )}
      </Box>
      <Box sx={{ mt: '14px', minWidth: 0 }}>{children}</Box>
    </Box>
  )
}

/** A rail card's 13 px meta line (right of its title), in the meta slot's colour. */
export function CardMeta({ children }: { children: ReactNode }) {
  return <Box sx={{ color: 'inherit', fontVariantNumeric: 'tabular-nums' }}>{children}</Box>
}

/** Placeholder rows while a list loads; `height` per row (default 40); `onDark` on the deep-sky card. */
export function LoadingRows({
  rows = 2,
  height = 40,
  onDark = false,
}: {
  rows?: number
  height?: number
  onDark?: boolean
}) {
  return (
    <Box sx={{ display: 'grid', gap: 2 }} role="status" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton
          key={i}
          variant="rounded"
          height={height}
          sx={{
            borderRadius: `${summit.radius.wellSmall}px`,
            ...(onDark && { bgcolor: summit.deepSky.well }),
          }}
        />
      ))}
    </Box>
  )
}
