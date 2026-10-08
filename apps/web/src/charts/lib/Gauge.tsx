// Owns: the semicircle gauge for one latest value against range bands (body fat %, visceral level): bands in
// status tints with surface gaps (the band the value sits in a step darker), an ink marker at the value, the number
// in the middle (2a stat type: 600, −.02em, tabular) and the band it falls in.
import Box from '@mui/material/Box'
import { formatNumber } from '../../components'
import { tokens } from '../../theme'
import { tintOnCard } from './frame'

export type GaugeTone = 'good' | 'warning' | 'flag'

export interface GaugeBand {
  /** Upper bound of the band; the first band starts at `min`. */
  to: number
  tone: GaugeTone
  /** e.g. "Healthy", "High". */
  label: string
}

export interface GaugeProps {
  value: number
  min: number
  max: number
  /** Ascending; the last `to` should equal `max`. */
  bands: readonly GaugeBand[]
  /** e.g. "Body fat". */
  label: string
  unit?: string
  precision?: number
  /** Width in px. Default 220. */
  size?: number
  /** Default "chart-gauge". */
  testId?: string
}

const STROKE = 12
const GAP_DEG = 1.6

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const [x1, y1] = polar(cx, cy, r, from)
  const [x2, y2] = polar(cx, cy, r, to)
  return `M${x1} ${y1}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`
}

export function Gauge({
  value,
  min,
  max,
  bands,
  label,
  unit,
  precision = 0,
  size = 220,
  testId = 'chart-gauge',
}: GaugeProps) {
  const r = size / 2 - STROKE / 2 - 2
  const cx = size / 2
  const cy = r + STROKE / 2 + 2
  const h = cy + 8
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const deg = (v: number) => 180 + ((clamp(v) - min) / (max - min)) * 180
  const band = bands.find((b) => value <= b.to) ?? bands.at(-1)
  const toneColor = band ? tokens.status[band.tone] : tokens.ink.secondary
  const [mx, my] = polar(cx, cy, r, deg(value))
  let prev = min

  return (
    <Box
      data-testid={testId}
      role="img"
      aria-label={`${label}: ${formatNumber(value, precision)}${unit ? ` ${unit}` : ''}${band ? `, ${band.label}` : ''}`}
      sx={{ width: size, maxWidth: '100%', mx: 'auto', textAlign: 'center' }}
    >
      <Box sx={{ position: 'relative', width: size, maxWidth: '100%', height: h }}>
        <svg width="100%" height={h} viewBox={`0 0 ${size} ${h}`} aria-hidden style={{ display: 'block' }}>
          {bands.map((b, i) => {
            const from = deg(prev) + (i === 0 ? 0 : GAP_DEG / 2)
            const to = deg(b.to) - (i === bands.length - 1 ? 0 : GAP_DEG / 2)
            prev = b.to
            const active = b === band
            return (
              <path
                key={i}
                d={arc(cx, cy, r, from, to)}
                fill="none"
                stroke={tintOnCard(tokens.status[b.tone], active ? 0.55 : 0.2)}
                strokeWidth={STROKE}
              />
            )
          })}
          <circle
            cx={mx}
            cy={my}
            r={STROKE / 2 + 2}
            fill={tokens.ink.text}
            stroke={tokens.ink.card}
            strokeWidth={3}
          />
        </svg>
        <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, lineHeight: 1 }}>
          <Box
            component="span"
            sx={{
              fontSize: Math.round(size * 0.15),
              fontWeight: tokens.font.weight.number,
              letterSpacing: tokens.font.em.number,
              fontVariantNumeric: 'tabular-nums',
              color: tokens.ink.text,
            }}
          >
            {formatNumber(value, precision)}
          </Box>
          {unit && (
            <Box
              component="span"
              sx={{
                ml: 1,
                fontSize: tokens.font.size.small,
                fontWeight: tokens.font.weight.label,
                color: tokens.ink.secondary,
              }}
            >
              {unit}
            </Box>
          )}
        </Box>
      </Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          px: 0.5,
          mt: 1,
          fontSize: tokens.chart.axisFontSize,
          color: tokens.chart.axis,
        }}
      >
        <span>{formatNumber(min)}</span>
        <span>{formatNumber(max)}</span>
      </Box>
      <Box
        sx={{
          mt: 1,
          fontSize: tokens.font.size.label,
          fontWeight: tokens.font.weight.label,
          color: tokens.ink.label,
        }}
      >
        {label}
      </Box>
      {band && (
        <Box
          sx={{
            mt: 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1.5,
            fontSize: tokens.font.size.caption,
            fontWeight: tokens.font.weight.label,
            color: tokens.ink.text,
          }}
        >
          <Box
            aria-hidden
            sx={{ width: 8, height: 8, borderRadius: `${tokens.radius.bar}px`, bgcolor: toneColor }}
          />
          {band.label}
        </Box>
      )}
    </Box>
  )
}
