// Owns: the SVG progress ring — value of target in one colour, round caps, one number in the centre (2a: the Dashboard's
// 84 px goal ring with an 8 px stroke and a 16/600 centre, the session's 56 px ring with 6 px and 12/600). Past 100 % a
// second lap is drawn over the first with a surface-coloured ring so "over target" reads at a glance. The arc draws
// from 0 on mount over 1.4 s on the entrance curve; under reduced motion it is simply there.
//
// Props are unchanged; new: `color` (any token colour, for a ring that is not a metric — the goal ring is the accent)
// and `trackColor` (default the colour's 16 % tint; 2a puts the neutral #F4F4F5 on white and #E4E4E7 on a panel).
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { enterEasing, tokens, withAlpha, type MetricKey } from '../../theme'
import { formatNumber } from './format'
import { useEntrance } from './useEntrance'

export interface MetricRingProps {
  value: number
  target: number
  metric: MetricKey
  /** A literal token colour for the arc, overriding the metric's (e.g. `tokens.accent.main`). */
  color?: string
  /** The track under the arc. Default: the arc colour at 16 %. */
  trackColor?: string
  /** Outer diameter in px. Default 72. 2a sizes: 84 and 56. */
  size?: number
  /** Stroke width in px. Default size / 10 (84 → 8, 56 → 6). */
  thickness?: number
  /** Centre text. Default: the value, rounded. */
  centre?: ReactNode
  /** Small line under the centre text, e.g. "left" or "ml". */
  centreCaption?: string
  /** Accessible name, e.g. "Protein". The aria-label reads "Protein: 96 of 130 g". */
  label: string
  unit?: string
  /** Draw delay in ms, to follow the card's entrance. */
  delay?: number
}

export function MetricRing({
  value,
  target,
  metric,
  color: colorProp,
  trackColor,
  size = 72,
  thickness,
  centre,
  centreCaption,
  label,
  unit,
  delay = 0,
}: MetricRingProps) {
  const { entered, reduced } = useEntrance()
  const color = colorProp ?? tokens.metric[metric]
  const stroke = thickness ?? Math.max(4, Math.round(size / 10))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const ratio = target > 0 ? Math.max(0, value) / target : 0
  const firstLap = Math.min(ratio, 1)
  const overLap = ratio > 1 ? Math.min(ratio - 1, 1) : 0
  // 84 → 16 px, 56 → 12 px: 2a's centre sizes, and never under 12.
  const centreFont = Math.max(12, Math.round(size * 0.19))
  const half = size / 2
  const ariaLabel = `${label}: ${formatNumber(value)} of ${formatNumber(target)}${unit ? ` ${unit}` : ''}`
  const draw = reduced ? 'none' : `stroke-dasharray ${tokens.motion.duration.grow}ms ${enterEasing()} ${delay}ms`

  return (
    <Box
      role="img"
      aria-label={ariaLabel}
      data-over={ratio > 1 ? 'true' : undefined}
      sx={{ position: 'relative', width: size, height: size, flex: 'none' }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden focusable="false">
        <g transform={`rotate(-90 ${half} ${half})`} fill="none" strokeLinecap="round">
          <circle cx={half} cy={half} r={r} stroke={trackColor ?? withAlpha(color, 0.16)} strokeWidth={stroke} />
          {firstLap > 0 && (
            <circle
              cx={half}
              cy={half}
              r={r}
              stroke={color}
              strokeWidth={stroke}
              strokeDasharray={`${entered ? c * firstLap : 0} ${c}`}
              style={{ transition: draw }}
            />
          )}
          {overLap > 0 && (
            <>
              {/* Surface ring separates the second lap from the first. */}
              <circle cx={half} cy={half} r={r} stroke={tokens.ink.card} strokeWidth={stroke + 3} strokeDasharray={`${entered ? c * overLap : 0} ${c}`} style={{ transition: draw }} />
              <circle cx={half} cy={half} r={r} stroke={color} strokeWidth={stroke} strokeDasharray={`${entered ? c * overLap : 0} ${c}`} style={{ transition: draw }} />
            </>
          )}
        </g>
      </svg>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          lineHeight: 1,
        }}
      >
        <Box
          component="span"
          sx={{
            fontSize: centreFont,
            fontWeight: tokens.font.weight.number,
            fontVariantNumeric: 'tabular-nums',
            color: tokens.ink.text,
            lineHeight: 1,
          }}
        >
          {centre ?? formatNumber(value)}
        </Box>
        {centreCaption && (
          <Box
            component="span"
            sx={{
              mt: 0.5,
              fontSize: Math.max(10, Math.round(size * 0.14)),
              fontWeight: tokens.font.weight.label,
              color: tokens.ink.secondary,
              lineHeight: 1,
            }}
          >
            {centreCaption}
          </Box>
        )}
      </Box>
    </Box>
  )
}
