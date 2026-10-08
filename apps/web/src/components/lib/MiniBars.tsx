// Owns: the 2a mini bar sparkline on a dashboard tile — up to a dozen bars in a 40 px row (gap 3, radius 2), the days
// that hit the target in the full metric colour and the rest in its tint, under a 1 px dashed target line placed by
// percentage. Bars grow from the baseline on mount (1.4 s, 30 ms apart); under reduced motion they are simply there.
// The whole strip is one image with a caller-written summary, because twelve unlabelled bars mean nothing read aloud.
import Box from '@mui/material/Box'
import { enterEasing, metricTint, tokens, type MetricKey } from '../../theme'
import { useEntrance } from './useEntrance'

export interface MiniBarsProps {
  /** One value per day, oldest first. `null` is a day with nothing logged (an empty slot). */
  values: readonly (number | null)[]
  metric: MetricKey
  /** Draws the dashed target line and decides the default `hit`. */
  target?: number | null
  /** Top of the scale. Default: the larger of the biggest value and the target, with 15 % headroom. */
  max?: number
  /** Which days count as on target (full colour). Default: value ≥ target (none when there is no target). */
  hit?: (value: number, index: number) => boolean
  /** Strip height, px. Default 40. */
  height?: number
  /** Accessible summary, e.g. "Average 1,319 kcal a day over 12 days; target 1,400". */
  label: string
  testId?: string
}

/** Each bar starts this many ms after the one before it. */
const BAR_STAGGER = 30

export function MiniBars({ values, metric, target, max, hit, height = 40, label, testId }: MiniBarsProps) {
  const { entered, reduced } = useEntrance()
  const numbers = values.filter((v): v is number => v !== null && Number.isFinite(v))
  const top = max ?? Math.max(...numbers, target ?? 0, 1) * 1.15
  const isHit = hit ?? ((v: number) => target !== null && target !== undefined && v >= target)
  const color = tokens.metric[metric]
  const tint = metricTint(metric)
  const targetTop = target !== null && target !== undefined && top > 0 ? Math.max(0, Math.min(100, (1 - target / top) * 100)) : null

  return (
    <Box
      role="img"
      aria-label={label}
      data-testid={testId}
      sx={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: '3px', height, minWidth: 0 }}
    >
      {values.map((v, i) => {
        const pct = v === null || !Number.isFinite(v) || top <= 0 ? 0 : Math.max(0, Math.min(100, (v / top) * 100))
        return (
          <Box
            key={i}
            aria-hidden
            sx={{
              flex: 1,
              minWidth: 0,
              // An empty day keeps its slot as a 2 px stub, so the strip still reads as consecutive days.
              height: v === null ? '2px' : `${pct}%`,
              borderRadius: `${tokens.radius.bar}px`,
              bgcolor: v === null ? tokens.ink.fill : isHit(v, i) ? color : tint,
              transformOrigin: 'bottom',
              transform: entered ? 'none' : 'scaleY(0)',
              transition: reduced ? 'none' : `transform ${tokens.motion.duration.grow}ms ${enterEasing()} ${i * BAR_STAGGER}ms`,
            }}
          />
        )
      })}
      {targetTop !== null && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${targetTop}%`,
            borderTop: `1px dashed ${tokens.chart.target}`,
            transformOrigin: 'left',
            transform: entered ? 'none' : 'scaleX(0)',
            transition: reduced ? 'none' : `transform ${tokens.motion.duration.grow}ms ${enterEasing()}`,
            pointerEvents: 'none',
          }}
        />
      )}
    </Box>
  )
}
