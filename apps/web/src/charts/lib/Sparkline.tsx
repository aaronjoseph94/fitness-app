// Owns: the sparkline for a stat's slot (1d: the Dashboard trend card's): a 3 px line in the metric colour over an
// area fading from 30 % to 0, the latest point as "you are here" (a white dot in a gold halo), and an optional dashed
// target line. No axes; the card's number carries the value. It draws itself in left to right on mount (none under
// reduced motion).
import Box from '@mui/material/Box'
import { keyframes } from '@mui/material/styles'
import { tokens, type MetricKey } from '../../theme'
import { currentPoint, useFadeId, useWidth } from './frame'

const wipe = keyframes`
  from { clip-path: inset(-12px 100% -12px -12px); }
  to { clip-path: inset(-12px -12px -12px -12px); }
`

export interface SparklineProps {
  values: readonly (number | null | undefined)[]
  metric: MetricKey
  /** Default 36. */
  height?: number
  width?: number
  /** A target drawn as a dashed line (kept inside the scale). */
  reference?: number
}

export function Sparkline({ values, metric, height = 36, width, reference }: SparklineProps) {
  const [ref, w] = useWidth(width, 120)
  const fadeId = useFadeId('spark-fade')
  const C = tokens.metric[metric]
  const pts = values.flatMap((v, i) => (typeof v === 'number' && Number.isFinite(v) ? [[i, v] as const] : []))
  if (pts.length < 2) return <Box ref={ref} sx={{ height }} />
  const scale = reference === undefined ? pts.map((p) => p[1]) : [...pts.map((p) => p[1]), reference]
  const lo = Math.min(...scale)
  const hi = Math.max(...scale)
  /** Room for the current point's halo (9 px radius). */
  const pad = 10
  const sx = (i: number) => pad + (i / (values.length - 1)) * (w - 2 * pad)
  const sy = (v: number) => pad + (hi === lo ? 0.5 : 1 - (v - lo) / (hi - lo)) * (height - 2 * pad)
  const line = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join('')
  const area = `${line}L${sx(pts.at(-1)![0]).toFixed(1)} ${height}L${sx(pts[0]![0]).toFixed(1)} ${height}Z`
  const [lx, lv] = pts.at(-1)!
  const Now = currentPoint()
  return (
    <Box
      ref={ref}
      data-testid="sparkline"
      sx={{
        width: width ?? '100%',
        height,
        '@media (prefers-reduced-motion: no-preference)': {
          '& svg': { animation: `${wipe} ${tokens.motion.duration.draw}ms ${tokens.motion.easing.out} both` },
        },
      }}
    >
      <svg width={w} height={height} aria-hidden style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={C} stopOpacity={0.3} />
            <stop offset="1" stopColor={C} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${fadeId})`} />
        {reference !== undefined && (
          <line
            x1={pad}
            x2={w - pad}
            y1={sy(reference)}
            y2={sy(reference)}
            stroke={tokens.chart.target}
            strokeWidth={1}
            strokeDasharray={tokens.chart.targetDash}
            data-testid="sparkline-reference"
          />
        )}
        <path
          d={line}
          fill="none"
          stroke={C}
          strokeWidth={tokens.chart.lineWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Now cx={sx(lx)} cy={sy(lv)} />
      </svg>
    </Box>
  )
}
