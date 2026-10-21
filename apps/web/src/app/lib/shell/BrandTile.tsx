// Owns: the app mark on its glass tile — the Summit mark of public/icons/icon.svg (a white trend polyline climbing to
// a gold sun, our own drawing), in a 46 px glass tile on the sky (44 px on a phone). The Summit nav's logo link shows
// it. Decorative: whatever holds it carries the name.
import Box from '@mui/material/Box'
import { tokens } from '../../../theme'

const { summit } = tokens

/** The mark's shapes in icon.svg's 512 box: the trend line, then the sun. */
const SUMMIT_MARK = {
  line: '90,356 190,256 264,312 338,238',
  lineWidth: 52,
  sun: { cx: 398, cy: 178, r: 44 },
} as const

export function BrandTile({ size = 46 }: { size?: 44 | 46 }) {
  const small = size === 44
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        boxSizing: 'border-box',
        borderRadius: `${small ? summit.radius.navTileSmall : summit.radius.navTile}px`,
        bgcolor: summit.glass.tile,
        border: `1px solid ${summit.glass.tileBorder}`,
        backdropFilter: `blur(${summit.glass.tileBlur}px)`,
      }}
    >
      <svg viewBox="0 0 512 512" width={small ? 24 : 26} height={small ? 24 : 26} focusable="false">
        <polyline
          points={SUMMIT_MARK.line}
          fill="none"
          stroke={summit.onSky.text}
          strokeWidth={SUMMIT_MARK.lineWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle {...SUMMIT_MARK.sun} fill={summit.gold.main} />
      </svg>
    </Box>
  )
}
