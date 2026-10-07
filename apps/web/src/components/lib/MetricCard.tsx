// Owns: the metric card — label, one big number with its unit, and a fill bar against the target when a caller
// supplies one.
//
// Two surfaces, one component (`surface`):
//   • `gradient` — the app's one identity surface, filled with the metric's gradient and white text. Measured at
//     4.5:1 or better at BOTH gradient stops (see theme.ts), so the number is readable rather than merely colourful.
//     Reserved for the single most important number on a screen (the Dashboard hero).
//   • `plain` — a white card on the grouped grey where the metric colour is an *accent* rather than a fill (the icon
//     tile, the target bar). This is what Health does: five saturated blocks in a column is the least restrained
//     surface in an app, and today's five metrics are five facts of equal weight, not five banners.
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import type { SvgIconComponent } from '@mui/icons-material'
import type { ReactNode } from 'react'
import { enterDuration, enterEasing, metricGradient, reducedEntrance, tokens, withAlpha, type MetricKey } from '../../theme'
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
  /**
   * How the card is filled. `gradient` is the app's one saturated surface (one per screen at most); `plain` is a
   * white card with the metric colour as an accent. Default `gradient`, so an existing caller is unchanged.
   */
  surface?: 'gradient' | 'plain'
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
  surface = 'gradient',
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

  const tint = tokens.metric[metric]
  const plain = surface === 'plain'
  // One place that decides what a metric card is made of, so the two surfaces cannot drift apart.
  const tone = plain
    ? {
        text: tokens.ink.text,
        label: tokens.ink.secondary,
        muted: tokens.ink.secondary,
        tile: withAlpha(tint, 0.12),
        tileInk: tint,
        track: withAlpha(tint, 0.16),
        bar: tint,
      }
    : {
        text: tokens.ink.card,
        label: tokens.ink.card,
        muted: 'rgba(255,255,255,0.94)',
        tile: 'rgba(255,255,255,0.20)',
        tileInk: tokens.ink.card,
        track: 'rgba(255,255,255,0.26)',
        bar: tokens.ink.card,
      }

  const body = (
    // The padding and the number step down on a phone: five of these sit two-across in a 390 px column, and a 40 px
    // number plus a unit does not fit a half-width card.
    // The tile, the gaps and the numbers all shrink on a phone: at the narrowest two-across layout a card is about
    // 173 px wide, and a 40 px number with a unit and a 36 px tile simply does not fit 125 px of content.
    <Box sx={{ p: { xs: 2.5, md: 4 }, width: '100%', textAlign: 'left', color: tone.text }}>
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
              bgcolor: tone.tile,
              color: tone.tileInk,
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
            // On the gradient the label is white (it is the card's title); on a plain card it steps back to secondary
            // ink, so the number is what the eye lands on first.
            color: tone.label,
            letterSpacing: { xs: tokens.font.tracking.label, md: tokens.font.tracking.emphasis },
            lineHeight: tokens.font.leading.label,
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
            fontSize: { xs: tokens.font.size.bigNumberSmall, lg: tokens.font.size.statNumber },
            fontWeight: tokens.font.weight.number,
            lineHeight: tokens.font.leading.number,
            letterSpacing: tokens.font.tracking.number,
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
            sx={{ fontSize: { xs: tokens.font.size.label, md: tokens.font.size.small }, fontWeight: tokens.font.weight.label, color: tone.muted }}
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
          sx={{ mt: { xs: 2, md: 3 }, height: 6, borderRadius: `${tokens.radius.chip}px`, bgcolor: tone.track, overflow: 'hidden' }}
        >
          <Box
            sx={{
              height: '100%',
              width: entered ? `${Math.min(1, ratio) * 100}%` : '0%',
              borderRadius: 'inherit',
              bgcolor: tone.bar,
              // The bar fills on the same spring the card entered on, so the two settle together. Under reduced motion
              // the value arrives without travelling, which is the point of the preference.
              transition: reduced ? 'none' : `width ${enterDuration()}ms ${enterEasing()}`,
            }}
          />
        </Box>
      )}

      {caption && <Box sx={{ mt: 2, fontSize: tokens.font.size.label, color: tone.muted, lineHeight: tokens.font.leading.label }}>{caption}</Box>}
    </Box>
  )

  const surfaceSx = {
    height: '100%',
    minWidth: 0,
    borderRadius: `${tokens.radius.card}px`,
    backgroundColor: plain ? tokens.ink.card : undefined,
    backgroundImage: plain ? 'none' : metricGradient(metric),
    boxShadow: plain ? tokens.elevation.card : tokens.elevation.raised,
    opacity: entered ? 1 : 0,
    transform: entered ? 'none' : `translateY(${tokens.motion.rise}px)`,
    transition: reduced
      ? 'none'
      : `opacity ${enterDuration()}ms ${enterEasing()} ${delay}ms, transform ${enterDuration()}ms ${enterEasing()} ${delay}ms, box-shadow ${tokens.motion.duration.fast}ms ${tokens.motion.easing.standard}`,
    animation: reducedEntrance(delay, reduced),
  } as const

  // A card that does nothing must not look like it does: only a clickable one lifts on hover.
  if (!onClick) {
    return (
      // `group`, not `img`: the card has readable content inside it (the number, the caption, the progress bar), and an
      // `img` role would present that subtree as a single unreadable leaf.
      <Box role="group" aria-label={accessibleName} data-testid={testId} sx={surfaceSx}>
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
        ...surfaceSx,
        display: 'block',
        textAlign: 'left',
        font: 'inherit',
        '@media (hover: hover)': {
          '&:hover': { transform: 'translateY(-2px)', boxShadow: tokens.elevation.overlay },
        },
        // Feedback on the press, not on release, and no travel under reduced motion.
        '&:active': { transform: 'scale(0.99)' },
        '@media (prefers-reduced-motion: reduce)': { '&:active': { transform: 'none' } },
      }}
    >
      {body}
    </ButtonBase>
  )
}
