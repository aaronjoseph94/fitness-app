// Owns: the app mark on its tile — the icon's rising trend line toward a target dot (public/icons/icon.svg, with 2a's
// heavier stroke for 18 px), drawn in white on a 32 px accent tile. The sidebar's brand row and the phone's top bar
// show it. Decorative: whatever holds it carries the name.
import Box from '@mui/material/Box'
import { tokens } from '../../../theme'

export function BrandTile() {
  return (
    <Box
      aria-hidden
      sx={{
        width: 32,
        height: 32,
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        borderRadius: `${tokens.radius.control}px`,
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
      }}
    >
      <svg viewBox="0 0 512 512" width={18} height={18} focusable="false">
        <polyline
          points="90,356 190,256 264,312 338,238"
          fill="none"
          stroke="currentColor"
          strokeWidth={56}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={398} cy={178} r={46} fill="currentColor" />
      </svg>
    </Box>
  )
}
