// Owns: the pill that sits on the sky (README §5) — a non-interactive label in glass (white text on the glass fill and
// its white border: "28.6 kg to the summit", the readiness pill), teal ("↓ 1.5 kg since base camp") or dark glass,
// 15/600, fully round, with an optional leading glyph. `ariaLabel` replaces what assistive tech reads (a span's
// aria-label is ignored, so it is visually hidden text and the visible words are hidden from it). For a control on the
// sky, use a Button inside `PageHeader`'s action row, which takes the glass look itself.
import type { SvgIconComponent } from '@mui/icons-material'
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { tokens } from '../../theme'
import { visuallyHidden } from './PageHero'

const { summit, font } = tokens

/** Each look; the translucent ones blur what is behind them, the teal (92 % opaque) needs no blur. */
const LOOKS = {
  glass: {
    bgcolor: summit.glass.tile,
    border: `1px solid ${summit.glass.tileBorder}`,
    backdropFilter: `blur(${summit.glass.tileBlur}px)`,
  },
  teal: { bgcolor: summit.pill.teal, border: '1px solid transparent' },
  dark: {
    bgcolor: summit.glass.card,
    border: `1px solid ${summit.glass.cardBorder}`,
    backdropFilter: `blur(${summit.glass.tileBlur}px)`,
  },
} as const

export interface GlassPillProps {
  /** `glass` (default), `teal` (good news on the sky) or `dark`. */
  tone?: keyof typeof LOOKS
  icon?: SvgIconComponent
  children: ReactNode
  /** `medium` 15 px (default) or `small` 13 px. */
  size?: 'medium' | 'small'
  /** What assistive tech reads instead of the visible words, e.g. the direction a bare arrow shows. */
  ariaLabel?: string
  testId?: string
}

export function GlassPill({
  tone = 'glass',
  icon: Icon,
  children,
  size = 'medium',
  ariaLabel,
  testId,
}: GlassPillProps) {
  const small = size === 'small'
  return (
    <Box
      component="span"
      data-testid={testId}
      sx={{
        ...LOOKS[tone],
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        maxWidth: '100%',
        boxSizing: 'border-box',
        py: small ? '5px' : '8px',
        pl: Icon ? (small ? '8px' : '10px') : small ? '11px' : '14px',
        pr: small ? '11px' : '14px',
        borderRadius: `${summit.radius.pill}px`,
        color: summit.onSky.text,
        fontSize: small ? font.size.small : font.size.emphasis,
        fontWeight: font.weight.heading,
        lineHeight: 1.3,
        whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {Icon && <Icon aria-hidden sx={{ fontSize: small ? 16 : 18, flex: 'none' }} />}
      {ariaLabel && (
        <Box component="span" sx={visuallyHidden}>
          {ariaLabel}
        </Box>
      )}
      <Box
        component="span"
        aria-hidden={ariaLabel ? true : undefined}
        sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {children}
      </Box>
    </Box>
  )
}
