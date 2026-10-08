// Owns: the metric card — label, one big number with its unit, and a fill bar against the target when a caller supplies
// one; the card enters on the page's 2a entrance (rise 26 px, fade, 700 ms, its own `delay` for the stagger).
//
// Two surfaces, one component (`surface`):
//   • `plain` — the 2a stat card exactly (white, hairline border, 13/500 #52525B label with a 16 px faint glyph on the
//     right, 28/600 value with a 13 px muted unit, a 6 px #F4F4F5 track filled in the metric colour, a 12 px muted
//     caption). This is what every 2a page uses.
//   • `gradient` — the legacy identity surface (the metric's gradient, white text, ≥4.5:1 at both stops). 2a has no
//     gradient surfaces; it is kept so a caller that has not moved yet still renders, and cleanup removes it.
// Props are unchanged; new: `countUp` (the value counts up once on mount, never under reduced motion).
import type { SvgIconComponent } from '@mui/icons-material'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import type { ReactNode } from 'react'
import { enterDuration, enterEasing, metricGradient, reducedEntrance, tokens, withAlpha, type MetricKey } from '../../theme'
import { formatNumber } from './format'
import { ProgressBar } from './ProgressBar'
import { StatCaption, StatFigure, StatHead } from './statParts'
import { useEntrance } from './useEntrance'

export interface MetricCardProps {
  label: string
  metric: MetricKey
  /** A 16 px glyph right of the label. Optional: the label always names the metric. */
  icon?: SvgIconComponent
  value: number | string | null
  unit?: string
  /** Decimal places for a numeric value. Default 0. */
  precision?: number
  /** Value ÷ target, drawn as a fill bar. Omit for no bar. Over 1 fills the bar and the caption should say so. */
  progress?: number | null
  /**
   * The target the value is measured against, in the value's own unit. When given, the card's accessible name spells
   * the whole sentence out — "Water: 4,808 of 3,000 ml" — so amount and target are one announcement.
   */
  target?: number | null
  /** Line under the bar, e.g. <><strong>540 left</strong> · 2 meals logged</>. */
  caption?: ReactNode
  /** `plain` is the 2a card; `gradient` is the legacy saturated surface. Default `gradient` (unchanged for callers). */
  surface?: 'gradient' | 'plain'
  /** Makes the whole card a tap target. */
  onClick?: () => void
  /** Entrance stagger in ms (also delays the count-up and the bar). */
  delay?: number
  /** Count a numeric value up once on mount. */
  countUp?: boolean
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
  countUp = false,
  testId,
}: MetricCardProps) {
  const { entered, reduced } = useEntrance()
  const display = typeof value === 'number' || value === null ? formatNumber(value, precision) : value
  const ratio = progress === null || progress === undefined ? null : Math.max(0, progress)
  const unitSuffix = unit ? ` ${unit}` : ''
  const accessibleName =
    target === null || target === undefined ? `${label}: ${display}${unitSuffix}` : `${label}: ${display} of ${formatNumber(target, precision)}${unitSuffix}`
  const plain = surface === 'plain'

  const body = plain ? (
    <Box sx={{ px: `${tokens.pad.card.x}px`, pt: `${tokens.pad.card.y}px`, pb: '16px', width: '100%', textAlign: 'left', color: tokens.ink.text, minWidth: 0 }}>
      <StatHead label={label} icon={Icon} />
      <StatFigure value={value} unit={unit} precision={precision} countUp={countUp} delay={delay} />
      {ratio !== null && (
        <Box sx={{ mt: '12px' }}>
          <ProgressBar value={ratio} metric={metric} label={`${label} against target`} delay={delay} />
        </Box>
      )}
      {caption && <StatCaption>{caption}</StatCaption>}
    </Box>
  ) : (
    // Legacy gradient surface: white text on the metric's gradient.
    <Box sx={{ px: `${tokens.pad.card.x}px`, pt: `${tokens.pad.card.y}px`, pb: '16px', width: '100%', textAlign: 'left', color: tokens.ink.card }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: 20 }}>
        <Box component="span" sx={{ flex: 1, minWidth: 0, fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </Box>
        {Icon && <Icon aria-hidden sx={{ fontSize: 16, flex: 'none' }} />}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '6px', mt: '10px', minWidth: 0 }}>
        <Box component="span" sx={{ fontSize: tokens.font.size.bigNumber, fontWeight: tokens.font.weight.number, lineHeight: 1, letterSpacing: tokens.font.em.number, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {display}
        </Box>
        {unit && value !== null && <Box component="span" sx={{ fontSize: tokens.font.size.small }}>{unit}</Box>}
      </Box>
      {ratio !== null && (
        <Box sx={{ mt: '12px' }}>
          <ProgressBar value={ratio} color={tokens.ink.card} trackColor={withAlpha(tokens.ink.card, 0.26)} label={`${label} against target`} delay={delay} />
        </Box>
      )}
      {caption && <Box sx={{ mt: '8px', fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.caption }}>{caption}</Box>}
    </Box>
  )

  const surfaceSx = {
    height: '100%',
    minWidth: 0,
    borderRadius: `${tokens.radius.card}px`,
    border: plain ? `1px solid ${tokens.ink.border}` : 'none',
    backgroundColor: plain ? tokens.ink.card : undefined,
    backgroundImage: plain ? 'none' : metricGradient(metric),
    boxShadow: tokens.elevation.card,
    opacity: entered ? 1 : 0,
    transform: entered ? 'none' : `translateY(${tokens.motion.rise}px)`,
    transition: reduced
      ? 'none'
      : `opacity ${enterDuration()}ms ${enterEasing()} ${delay}ms, transform ${enterDuration()}ms ${enterEasing()} ${delay}ms, box-shadow ${tokens.motion.duration.fast}ms ${tokens.motion.easing.standard}`,
    animation: reducedEntrance(delay, reduced),
  } as const

  if (!onClick) {
    return (
      // `group`, not `img`: the card has readable content inside it (the number, the caption, the progress bar).
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
        // 2a: the border stays; a clickable card deepens its shadow on hover and presses in.
        '@media (hover: hover)': { '&:hover': { boxShadow: tokens.elevation.raised } },
        '&:active': { transform: 'scale(0.99)' },
        '@media (prefers-reduced-motion: reduce)': { '&:active': { transform: 'none' } },
      }}
    >
      {body}
    </ButtonBase>
  )
}
