// Owns: the bare food icon beside a meal item or a favourite on the Log tab (2a: the Fluent Emoji Flat icon at 20–22 px
// with no frame), matched by name through the quick-log icon index; a muted plate glyph while the index loads, without
// a match, or when the SVG fails. Decorative: the name beside it carries the meaning.
import RestaurantRounded from '@mui/icons-material/RestaurantRounded'
import Box from '@mui/material/Box'
import { useState } from 'react'
import { tokens } from '../../../theme'
import { useFoodIcons } from '../../quick-log'

export function FoodGlyph({ name, size = 22 }: { name: string; size?: number }) {
  const src = useFoodIcons()(name)
  const [failed, setFailed] = useState<string | null>(null)
  if (!src || failed === src) {
    return (
      <Box aria-hidden sx={{ width: size, height: size, flex: 'none', display: 'grid', placeItems: 'center', color: tokens.ink.faint }}>
        <RestaurantRounded sx={{ fontSize: size * 0.75 }} />
      </Box>
    )
  }
  return <Box component="img" src={src} alt="" width={size} height={size} onError={() => setFailed(src)} sx={{ flex: 'none', display: 'block' }} />
}
