// Owns: the 2a progress bar — a 6 px fully round #F4F4F5 track with a fill in a metric (or any token) colour that grows
// from 0 on mount over 1.4 s on the entrance curve (in place under reduced motion). It is a `progressbar` with its own
// accessible name, so the number it stands for is announced, not just drawn.
import Box from '@mui/material/Box'
import { enterEasing, tokens, type MetricKey } from '../../theme'
import { useEntrance } from './useEntrance'

export interface ProgressBarProps {
  /** Value ÷ target. Over 1 fills the track (say so in the caption). Null/undefined draws an empty track. */
  value: number | null | undefined
  /** Fill colour from this metric. Default: the accent blue. */
  metric?: MetricKey
  /** A literal colour from `tokens` (wins over `metric`), e.g. `tokens.tone.success.solid`. */
  color?: string
  /** Accessible name, e.g. "Calories against target". */
  label: string
  /** Track colour. Default `tokens.ink.fill`. On a #FAFAFA panel use `tokens.ink.border`. */
  trackColor?: string
  /** Grow delay in ms, to follow the card's entrance. Default 0. */
  delay?: number
  testId?: string
}

export function ProgressBar({ value, metric, color, label, trackColor = tokens.ink.fill, delay = 0, testId }: ProgressBarProps) {
  const { entered, reduced } = useEntrance()
  const ratio = value === null || value === undefined || !Number.isFinite(value) ? 0 : Math.max(0, value)
  const fill = color ?? (metric ? tokens.metric[metric] : tokens.accent.main)
  return (
    <Box
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      data-testid={testId}
      sx={{ height: 6, borderRadius: `${tokens.radius.pill}px`, bgcolor: trackColor, overflow: 'hidden' }}
    >
      <Box
        sx={{
          height: '100%',
          width: `${Math.min(1, ratio) * 100}%`,
          borderRadius: 'inherit',
          bgcolor: fill,
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
