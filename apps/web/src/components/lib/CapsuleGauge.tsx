// Owns: the capsule gauge (README §4, Today's fuel) — a vertical capsule on its metric's tint track, filled from the
// bottom with the metric ramp (low → high) and a gloss highlight, the value (Outfit 400, unit at .62em) and a label
// with an optional caption ("of 1,400") under it. It is sized by container queries, so its card must be a size
// container (`sizeContainer` on the card): capsule clamp(28px, 10.5cqi, 72px) × clamp(80px, 26cqi, 170px), value
// clamp(12px, 4.4cqi, 24px), label clamp(10px, 3.6cqi, 14px). `CapsuleGaugeRow` lays five out in one row at every width.
// The fill grows from 0 on mount (in place under reduced motion). Each gauge is a `group` named with the whole reading
// ("Water: 1,750 of 3,000 ml"), the way Today's metric cards are read.
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { enterEasing, metricGradient, metricTint, tokens, type MetricKey } from '../../theme'
import { formatNumber } from './format'
import { useEntrance } from './useEntrance'

const { summit, font, motion } = tokens

/** Spread onto the card that holds the gauges: it becomes the size container their `cqi` units read. */
export const sizeContainer = { containerType: 'inline-size' } as const

export interface CapsuleGaugeProps {
  metric: MetricKey
  /** The figure the fill stands for, against `target`. Null draws an empty capsule. */
  value: number | null
  target: number | null
  /** What the gauge reads ("kcal left", "protein"). */
  label: string
  /** The value as shown (e.g. "1.75"); default the value, rounded. */
  display?: ReactNode
  /** Beside the value at .62em ("g", "L"). */
  unit?: string
  /** The muted line under the label ("of 1,400"). */
  caption?: ReactNode
  /** The fill ratio when it is not value ÷ target (calories left: what is eaten). */
  ratio?: number | null
  /** The group's accessible name. Default "<label>: <value> of <target> <unit>". */
  ariaLabel?: string
  /** Under the caption, e.g. a `<PendingBadge/>`. */
  badge?: ReactNode
  /** Grow delay in ms, to follow the card's stagger. */
  delay?: number
  testId?: string
}

export function CapsuleGauge({
  metric,
  value,
  target,
  label,
  display,
  unit,
  caption,
  ratio: ratioProp,
  ariaLabel,
  badge,
  delay = 0,
  testId,
}: CapsuleGaugeProps) {
  const { entered, reduced } = useEntrance()
  const ratio =
    ratioProp !== undefined
      ? ratioProp
      : value !== null && target !== null && target > 0
        ? value / target
        : null
  const fill = ratio === null || !Number.isFinite(ratio) ? 0 : Math.min(1, Math.max(0, ratio))
  const name =
    ariaLabel ??
    `${label}: ${formatNumber(value)}${target !== null ? ` of ${formatNumber(target)}` : ''}${unit ? ` ${unit}` : ''}`
  return (
    <Box role="group" aria-label={name} data-testid={testId} sx={{ minWidth: 0, textAlign: 'center' }}>
      <Box
        aria-hidden
        sx={{
          position: 'relative',
          mx: 'auto',
          width: 'clamp(28px, 10.5cqi, 72px)',
          height: 'clamp(80px, 26cqi, 170px)',
          borderRadius: `${summit.radius.pill}px`,
          bgcolor: metricTint(metric),
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: `${fill * 100}%`,
            background: metricGradient(metric, '0deg'),
            transformOrigin: 'bottom',
            transform: entered ? 'none' : 'scaleY(0)',
            transition: reduced
              ? 'none'
              : `transform ${motion.duration.grow}ms ${enterEasing()} ${delay}ms, height ${motion.duration.base}ms ${motion.easing.standard}`,
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            left: '22%',
            top: '8%',
            width: '18%',
            height: '32%',
            borderRadius: `${summit.radius.pill}px`,
            bgcolor: summit.gloss,
          }}
        />
      </Box>
      <Box
        aria-hidden
        sx={{
          mt: 'clamp(6px, 2cqi, 12px)',
          fontFamily: font.display,
          fontSize: 'clamp(12px, 4.4cqi, 24px)',
          fontWeight: font.weight.number,
          letterSpacing: font.em.number,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          lineHeight: 1.2,
          color: tokens.ink.text,
        }}
      >
        {display ?? formatNumber(value)}
        {unit && (
          <Box
            component="span"
            sx={{ fontFamily: font.family, fontSize: '0.62em', fontWeight: font.weight.label }}
          >
            {` ${unit}`}
          </Box>
        )}
      </Box>
      <Box
        aria-hidden
        sx={{
          fontSize: 'clamp(10px, 3.6cqi, 14px)',
          fontWeight: font.weight.label,
          lineHeight: 1.2,
          color: tokens.ink.text,
        }}
      >
        {label}
      </Box>
      {caption && (
        <Box
          aria-hidden
          sx={{ fontSize: 'clamp(10px, 3.3cqi, 13px)', lineHeight: 1.25, color: tokens.ink.muted }}
        >
          {caption}
        </Box>
      )}
      {badge && <Box sx={{ mt: '4px', display: 'flex', justifyContent: 'center' }}>{badge}</Box>}
    </Box>
  )
}

/** Five gauges in one row at every width (`repeat(5, minmax(0, 1fr))`), spaced clamp(4px, 2cqi, 16px). */
export function CapsuleGaugeRow({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <Box
      data-testid={testId}
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
        gap: 'clamp(4px, 2cqi, 16px)',
        minWidth: 0,
      }}
    >
      {children}
    </Box>
  )
}
