// Owns: the SVG progress ring (value of target in one metric colour). Past 100 % a second lap is drawn over the
// first with a surface-coloured ring so "over target" reads at a glance; the centre carries one number.
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { tokens, withAlpha, type MetricKey } from '../../theme'
import { formatNumber } from './format'

export interface MetricRingProps {
  value: number
  target: number
  metric: MetricKey
  /** Outer diameter in px. Default 72. */
  size?: number
  /** Stroke width in px. Default size / 9. */
  thickness?: number
  /** Centre text. Default: the value, rounded. */
  centre?: ReactNode
  /** Small line under the centre text, e.g. "left" or "ml". */
  centreCaption?: string
  /** Accessible name, e.g. "Protein". The aria-label reads "Protein: 96 of 130 g". */
  label: string
  unit?: string
}

export function MetricRing({
  value,
  target,
  metric,
  size = 72,
  thickness,
  centre,
  centreCaption,
  label,
  unit,
}: MetricRingProps) {
  const color = tokens.metric[metric]
  const stroke = thickness ?? Math.max(5, Math.round(size / 9))
  const r = (size - stroke) / 2 - 1
  const c = 2 * Math.PI * r
  const ratio = target > 0 ? Math.max(0, value) / target : 0
  const firstLap = Math.min(ratio, 1)
  const overLap = ratio > 1 ? Math.min(ratio - 1, 1) : 0
  const centreFont = Math.round(size * (centreCaption ? 0.24 : 0.27))
  const half = size / 2
  const ariaLabel = `${label}: ${formatNumber(value)} of ${formatNumber(target)}${unit ? ` ${unit}` : ''}`

  return (
    <Box
      role="img"
      aria-label={ariaLabel}
      data-over={ratio > 1 ? 'true' : undefined}
      sx={{ position: 'relative', width: size, height: size, flex: 'none' }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden focusable="false">
        <g transform={`rotate(-90 ${half} ${half})`} fill="none" strokeLinecap="round">
          <circle cx={half} cy={half} r={r} stroke={withAlpha(color, 0.15)} strokeWidth={stroke} />
          {firstLap > 0 && (
            <circle
              cx={half}
              cy={half}
              r={r}
              stroke={color}
              strokeWidth={stroke}
              strokeDasharray={`${c * firstLap} ${c}`}
              style={{ transition: 'stroke-dasharray 400ms ease' }}
            />
          )}
          {overLap > 0 && (
            <>
              {/* Surface ring separates the second lap from the first. */}
              <circle
                cx={half}
                cy={half}
                r={r}
                stroke={tokens.ink.card}
                strokeWidth={stroke + 3}
                strokeDasharray={`${c * overLap} ${c}`}
              />
              <circle
                cx={half}
                cy={half}
                r={r}
                stroke={color}
                strokeWidth={stroke}
                strokeDasharray={`${c * overLap} ${c}`}
              />
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
