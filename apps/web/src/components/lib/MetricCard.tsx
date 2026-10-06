// Owns: the metric card — the one place in the app that carries a gradient, because there the fill encodes which
// metric the card is; every other surface stays flat. White on that fill was measured at 4.5:1 or better at BOTH
// gradient stops (see theme.ts), so the number is readable rather than merely colourful. The card shows a label, one
// big number with its unit, and a fill bar against the target when a caller supplies one.
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import type { SvgIconComponent } from '@mui/icons-material'
import type { ReactNode } from 'react'
import { metricGradient, tokens, type MetricKey } from '../../theme'
import { formatNumber } from './format'
import { useEntrance } from './useEntrance'

export interface MetricCardProps {
  label: string
  metric: MetricKey
  /** Leading icon. Optional: the label always names the metric, so the card never depends on the glyph. */
  icon?: SvgIconComponent
  value: number | string | null
  unit?: string
  /** Decimal places for a numeric value. Default 0. */
  precision?: number
  /** Value ÷ target, drawn as a fill bar. Omit for no bar. Over 1 fills the bar and the caption should say so. */
  progress?: number | null
  /**
   * The target the value is measured against, in the value's own unit. Optional, and separate from `progress` on
   * purpose: a caller can want a bar without naming the target, but when it is given the card's accessible name spells
   * the whole sentence out — "Water: 4,808 of 3,000 ml" — so the amount and the target are one announcement rather
   * than two loose numbers.
   */
  target?: number | null
  /** Line under the bar, e.g. "50% of your goal". */
  caption?: ReactNode
  /** Makes the whole card a tap target and adds a hover lift on a pointer device. */
  onClick?: () => void
  /** Entrance stagger in ms. */
  delay?: number
  testId?: string
}

export function MetricCard({
  label,
  metric,
  icon: Icon,
  value,
  unit,
  precision = 0,
  progress,
  target,
  caption,
  onClick,
  delay = 0,
  testId,
}: MetricCardProps) {
  const { entered, reduced } = useEntrance()
  const display = typeof value === 'number' || value === null ? formatNumber(value, precision) : value
  const ratio = progress === null || progress === undefined ? null : Math.max(0, progress)
  const percent = ratio === null ? null : Math.round(ratio * 100)
  const unitSuffix = unit ? ` ${unit}` : ''
  const accessibleName =
    target === null || target === undefined ? `${label}: ${display}${unitSuffix}` : `${label}: ${display} of ${formatNumber(target, precision)}${unitSuffix}`

  const body = (
    // The padding and the number step down on a phone: five of these sit two-across in a 390 px column, and a 40 px
    // number plus a unit does not fit a half-width card.
    // The tile, the gaps and the numbers all shrink on a phone: at the narrowest two-across layout a card is about
    // 173 px wide, and a 40 px number with a unit and a 36 px tile simply does not fit 125 px of content.
    <Box sx={{ p: { xs: 2.5, md: 4 }, width: '100%', textAlign: 'left', color: '#FFFFFF' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.5, md: 2 }, minHeight: { xs: 32, md: 40 } }}>
        {Icon && (
          <Box
            aria-hidden
            sx={{
              width: { xs: 32, md: 36 },
              height: { xs: 32, md: 36 },
              borderRadius: `${tokens.radius.control}px`,
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'rgba(255,255,255,0.20)',
              flex: 'none',
            }}
          >
            <Icon sx={{ fontSize: { xs: 18, md: 20 } }} />
          </Box>
        )}
        <Box
          component="span"
          sx={{
            flex: 1,
            minWidth: 0,
            fontSize: { xs: tokens.font.size.label, md: tokens.font.size.emphasis },
            fontWeight: tokens.font.weight.label,
            letterSpacing: 0.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: { xs: 1, md: 1.5 }, mt: { xs: 2, md: 3 }, minWidth: 0 }}>
        <Box
          component="span"
          sx={{
            fontSize: { xs: 30, sm: tokens.font.size.bigNumberSmall, lg: tokens.font.size.statNumber },
            fontWeight: tokens.font.weight.number,
            lineHeight: 1.05,
            letterSpacing: -1,
            fontVariantNumeric: 'tabular-nums',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {display}
        </Box>
        {unit && value !== null && (
          <Box
            component="span"
            sx={{ fontSize: { xs: tokens.font.size.label, md: tokens.font.size.small }, fontWeight: tokens.font.weight.label, color: 'rgba(255,255,255,0.94)' }}
          >
            {unit}
          </Box>
        )}
      </Box>

      {ratio !== null && (
        <Box
          role="progressbar"
          aria-label={`${label} against target`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? 0}
          sx={{ mt: { xs: 2, md: 3 }, height: 6, borderRadius: `${tokens.radius.chip}px`, bgcolor: 'rgba(255,255,255,0.26)', overflow: 'hidden' }}
        >
          <Box
            sx={{
              height: '100%',
              width: entered ? `${Math.min(1, ratio) * 100}%` : '0%',
              borderRadius: 'inherit',
              bgcolor: '#FFFFFF',
              transition: reduced ? 'none' : `width ${tokens.motion.duration.slower}ms ${tokens.motion.easing.enter}`,
            }}
          />
        </Box>
      )}

      {caption && (
        <Box sx={{ mt: 2, fontSize: tokens.font.size.label, color: 'rgba(255,255,255,0.94)', lineHeight: 1.4 }}>{caption}</Box>
      )}
    </Box>
  )

  const surface = {
    height: '100%',
    minWidth: 0,
    borderRadius: `${tokens.radius.card}px`,
    backgroundImage: metricGradient(metric),
    boxShadow: tokens.elevation.raised,
    opacity: entered ? 1 : 0,
    transform: entered ? 'none' : `translateY(${tokens.motion.rise}px)`,
    transition: reduced
      ? 'none'
      : `opacity ${tokens.motion.duration.base}ms ${tokens.motion.easing.enter} ${delay}ms, transform ${tokens.motion.duration.base}ms ${tokens.motion.easing.enter} ${delay}ms, box-shadow ${tokens.motion.duration.fast}ms ${tokens.motion.easing.standard}`,
  } as const

  // A card that does nothing must not look like it does: only a clickable one lifts on hover.
  if (!onClick) {
    return (
      // `group`, not `img`: the card has readable content inside it (the number, the caption, the progress bar), and an
      // `img` role would present that subtree as a single unreadable leaf.
      <Box role="group" aria-label={accessibleName} data-testid={testId} sx={surface}>
        {body}
      </Box>
    )
  }

  return (
    <ButtonBase
      data-testid={testId}
      onClick={onClick}
      aria-label={accessibleName}
      sx={{
        ...surface,
        display: 'block',
        textAlign: 'left',
        font: 'inherit',
        '@media (hover: hover)': {
          '&:hover': { transform: 'translateY(-2px)', boxShadow: tokens.elevation.overlay },
        },
      }}
    >
      {body}
    </ButtonBase>
  )
}
