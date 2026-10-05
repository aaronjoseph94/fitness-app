// Owns: the sparkline for a StatCard's slot: a 2 px line in the metric colour over a faint 12 % area, end dot
// with a surface ring, and an optional dashed target line. No axes; the card's number carries the value.
import Box from '@mui/material/Box'
import { tokens, withAlpha, type MetricKey } from '../../theme'
import { useWidth } from './frame'

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
  const C = tokens.metric[metric]
  const pts = values.flatMap((v, i) => (typeof v === 'number' && Number.isFinite(v) ? [[i, v] as const] : []))
  if (pts.length < 2) return <Box ref={ref} sx={{ height }} />
  const scale = reference === undefined ? pts.map((p) => p[1]) : [...pts.map((p) => p[1]), reference]
  const lo = Math.min(...scale)
  const hi = Math.max(...scale)
  const pad = 4
  const sx = (i: number) => pad + (i / (values.length - 1)) * (w - 2 * pad)
  const sy = (v: number) => pad + (hi === lo ? 0.5 : 1 - (v - lo) / (hi - lo)) * (height - 2 * pad)
  const line = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join('')
  const area = `${line}L${sx(pts.at(-1)![0]).toFixed(1)} ${height}L${sx(pts[0]![0]).toFixed(1)} ${height}Z`
  const [lx, lv] = pts.at(-1)!
  return (
    <Box ref={ref} data-testid="sparkline" sx={{ width: width ?? '100%', height }}>
      <svg width={w} height={height} aria-hidden style={{ display: 'block', overflow: 'visible' }}>
        <path d={area} fill={withAlpha(C, tokens.chart.areaOpacity)} />
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
        <circle cx={sx(lx)} cy={sy(lv)} r={4} fill={C} stroke={tokens.ink.card} strokeWidth={2} />
      </svg>
    </Box>
  )
}
