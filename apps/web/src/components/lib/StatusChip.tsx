// Owns: the 1d status pill — a small non-interactive label in one of the status tones (success, warning, danger,
// info-violet, neutral soft violet), the gold highlight ("Today", "Current", "PR": the gold CTA gradient with deep ink,
// 7.04:1 at its darkest end), an outline, or a dashed outline (something still to come: Scans' "Upcoming");
// fully round either way (`shape` is kept for callers: 1d draws badges as pills too), at 12 px (medium) or 11 px
// (small), with an optional leading glyph or status dot. Text always sits on its own tint at ≥4.5:1 (see theme.ts).
// For a chip a person taps, use MUI's <Chip onClick> (themed to the same look) instead.
import type { SvgIconComponent } from '@mui/icons-material'
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { CHIP_TONES, tokens, type Tone } from '../../theme'

export type StatusChipTone = Tone | 'gold' | 'outline' | 'dashed'

export interface StatusChipProps {
  /** Default `neutral`. */
  tone?: StatusChipTone
  label?: ReactNode
  children?: ReactNode
  /** Leading glyph (14 px medium, 12 px small), drawn in the text colour. */
  icon?: SvgIconComponent
  /** A 6 px dot before the label: `true` uses the tone's own solid colour; a string is a token colour. */
  dot?: boolean | string
  /** `medium` 12 px · padding 3 × 8 (default); `small` 11 px · padding 1 × 6. */
  size?: 'medium' | 'small'
  /** `badge` (default) or `pill`: both fully round in 1d. */
  shape?: 'badge' | 'pill'
  /** Accessible name when the visible text is not enough (e.g. a bare count). */
  ariaLabel?: string
  testId?: string
}

/**
 * The theme's badge colours (shared with MUI's filled `<Chip>`) plus a dot colour; the gold highlight (a gradient
 * `image` over its solid gold) and the two outline looks are the kit's own.
 */
const TONES: Record<
  StatusChipTone,
  { bg: string; image?: string; text: string; border?: string; dot: string; weight: number }
> = {
  success: { ...CHIP_TONES.success, dot: tokens.tone.success.solid },
  warning: { ...CHIP_TONES.warning, dot: tokens.tone.warning.text },
  danger: { ...CHIP_TONES.danger, dot: tokens.tone.danger.text },
  info: { ...CHIP_TONES.info, dot: tokens.accent.main },
  neutral: { ...CHIP_TONES.neutral, dot: tokens.ink.faint },
  gold: { ...CHIP_TONES.gold, image: tokens.summit.cta.gold.bg, dot: tokens.summit.cta.gold.text },
  outline: {
    bg: tokens.ink.card,
    text: tokens.ink.label,
    border: tokens.ink.border,
    dot: tokens.ink.faint,
    weight: tokens.font.weight.label,
  },
  dashed: {
    bg: 'transparent',
    text: tokens.ink.muted,
    border: tokens.ink.dashed,
    dot: tokens.ink.faint,
    weight: tokens.font.weight.body,
  },
}

export function StatusChip({
  tone = 'neutral',
  label,
  children,
  icon: Icon,
  dot,
  size = 'medium',
  shape = 'badge',
  ariaLabel,
  testId,
}: StatusChipProps) {
  const t = TONES[tone]
  const small = size === 'small'
  // A 1 px border is drawn inside the box (box-sizing), so an outline chip is the same size as a filled one.
  const border = t.border
    ? `1px ${tone === 'dashed' ? 'dashed' : 'solid'} ${t.border}`
    : '1px solid transparent'
  return (
    <Box
      component="span"
      aria-label={ariaLabel}
      data-testid={testId}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: small ? '3px' : '4px',
        flex: 'none',
        maxWidth: '100%',
        boxSizing: 'border-box',
        px: small ? '7px' : '10px',
        py: small ? 0 : '3px',
        border,
        borderRadius:
          shape === 'pill'
            ? `${tokens.radius.pill}px`
            : `${small ? tokens.radius.badgeSmall : tokens.radius.badge}px`,
        bgcolor: t.bg,
        backgroundImage: t.image,
        color: t.text,
        fontSize: small ? tokens.font.size.micro : tokens.font.size.caption,
        fontWeight: t.weight,
        lineHeight: '16px',
        whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {dot && (
        <Box
          component="span"
          aria-hidden
          sx={{
            width: 6,
            height: 6,
            flex: 'none',
            borderRadius: `${tokens.radius.pill}px`,
            bgcolor: typeof dot === 'string' ? dot : t.dot,
          }}
        />
      )}
      {Icon && <Icon aria-hidden sx={{ fontSize: small ? 12 : 14, flex: 'none' }} />}
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label ?? children}
      </Box>
    </Box>
  )
}
