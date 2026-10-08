// Owns: the app mark on its tile — a dumbbell (public/icons/icon.svg: a bar with two plates each side, our own
// drawing), in white on a 32 px accent tile. The sidebar's brand row and the phone's top bar show it. Decorative:
// whatever holds it carries the name.
import Box from '@mui/material/Box'
import { tokens } from '../../../theme'

/** The dumbbell's shapes in icon.svg's 512 box: the bar, then the plates from the outside in. */
export const DUMBBELL = [
  { x: 40, y: 238, width: 432, height: 36, rx: 18 },
  { x: 84, y: 150, width: 52, height: 212, rx: 18 },
  { x: 376, y: 150, width: 52, height: 212, rx: 18 },
  { x: 150, y: 186, width: 44, height: 140, rx: 16 },
  { x: 318, y: 186, width: 44, height: 140, rx: 16 },
] as const

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
      <svg viewBox="0 0 512 512" width={22} height={22} focusable="false">
        {DUMBBELL.map((shape) => (
          <rect key={shape.x} fill="currentColor" {...shape} />
        ))}
      </svg>
    </Box>
  )
}
