// Owns: the 1d progress bar — a fully round track with a fill that grows from 0 on mount over 1.6 s on the entrance
// curve (in place under reduced motion). A metric's bar (`metric`, or a `color` that is a metric's mark colour) draws
// the metric's ramp (README §2: low → high) on its tint track; any other colour fills solid on the soft violet track,
// and no colour at all draws the violet ramp. It is a `progressbar` with its own accessible name, so the number it
// stands for is announced, not just drawn.
import Box from '@mui/material/Box'
import { enterEasing, metricGradient, metricTint, tokens, type MetricKey } from '../../theme'
import { useEntrance } from './useEntrance'

export interface ProgressBarProps {
  /** Value ÷ target. Over 1 fills the track (say so in the caption). Null/undefined draws an empty track. */
  value: number | null | undefined
  /** Fill with this metric's ramp, on its tint track. Default: the violet ramp. */
  metric?: MetricKey
  /** A literal colour from `tokens` (wins over `metric`), e.g. `tokens.tone.success.solid`. A metric's mark colour
   * (`tokens.metric.protein`) draws that metric's ramp. */
  color?: string
  /** Accessible name, e.g. "Calories against target". */
  label: string
  /** Grow delay in ms, to follow the card's entrance. Default 0. */
  delay?: number
  /** Track height in px. Default 8 (README's macro and "next camp" bars are 10). */
  height?: number
  testId?: string
}

/** The metric whose mark colour this is, if any: lets a caller that passes `tokens.metric.x` get the ramp. */
function metricOfColour(color: string): MetricKey | undefined {
  return (Object.keys(tokens.metric) as MetricKey[]).find((key) => tokens.metric[key] === color)
}

export function ProgressBar({
  value,
  metric,
  color,
  label,
  delay = 0,
  height = 8,
  testId,
}: ProgressBarProps) {
  const { entered, reduced } = useEntrance()
  const ratio = value === null || value === undefined || !Number.isFinite(value) ? 0 : Math.max(0, value)
  const rampOf = color ? metricOfColour(color) : (metric ?? 'steps')
  const track = rampOf ? metricTint(rampOf) : tokens.ink.fill
  const fill = rampOf ? { backgroundImage: metricGradient(rampOf) } : { bgcolor: color }
  return (
    <Box
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      data-testid={testId}
      sx={{
        height,
        borderRadius: `${tokens.radius.pill}px`,
        bgcolor: track,
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          height: '100%',
          width: `${Math.min(1, ratio) * 100}%`,
          borderRadius: 'inherit',
          ...fill,
          transformOrigin: 'left center',
          // Grows by transform (no layout work); the width above is the resting state either way.
          transform: entered ? 'none' : 'scaleX(0)',
          // A later change of value (a log landing) slides the end of the fill rather than jumping.
          transition: reduced
            ? 'none'
            : `transform ${tokens.motion.duration.grow}ms ${enterEasing()} ${delay}ms, width ${tokens.motion.duration.base}ms ${tokens.motion.easing.standard}`,
        }}
      />
    </Box>
  )
}
