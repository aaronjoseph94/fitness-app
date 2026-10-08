// Owns: the 2a week slider (Dashboard and Progress volume maps) — a 4 px grey track for the whole range with the days
// on show drawn blue, the range's first and last dates at its ends, and a 14 px white knob with a 2 px blue ring that
// picks the window's last day. The slider names itself, says "7 days to 2026-10-07" to assistive tech, and is 44 px
// tall for touch (SPEC §11).
import Box from '@mui/material/Box'
import Slider from '@mui/material/Slider'
import { addDays, daysBetween } from '@fitness/shared/engine'
import { tokens, withAlpha } from '../../theme'
import { formatShortDate } from './format'

export interface WindowSliderProps {
  /** The range's first and last days (the track's ends). */
  from: string
  to: string
  /** The window's first and last days (the blue span). */
  start: string
  end: string
  /** The window's last day, in days after `from`. */
  value: number
  onChange: (value: number) => void
  ariaLabel: string
  testId?: string
}

export function WindowSlider({
  from,
  to,
  start,
  end,
  value,
  onChange,
  ariaLabel,
  testId,
}: WindowSliderProps) {
  const span = daysBetween(from, to)
  // A day's place on the track, as a share of [from, to].
  const pct = (date: string) => (span > 0 ? (daysBetween(from, date) / span) * 100 : 100)
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mt: '10px', width: '100%' }}>
      <Box component="span" sx={trackLabel}>
        {formatShortDate(from)}
      </Box>
      <Box sx={{ position: 'relative', flex: 1, minWidth: 0 }}>
        <Box aria-hidden sx={{ ...trackBar, left: 0, right: 0, bgcolor: tokens.ink.border }} />
        <Box
          aria-hidden
          sx={{
            ...trackBar,
            left: `${pct(start)}%`,
            width: `${pct(end) - pct(start)}%`,
            bgcolor: tokens.accent.main,
          }}
        />
        <Slider
          value={value}
          min={0}
          max={span}
          step={1}
          track={false}
          onChange={(_, v) => onChange(v as number)}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => `7 days to ${formatShortDate(addDays(from, v))}`}
          getAriaValueText={(v) => `7 days to ${addDays(from, v)}`}
          aria-label={ariaLabel}
          data-testid={testId}
          sx={sliderSx}
        />
      </Box>
      <Box component="span" sx={trackLabel}>
        {formatShortDate(to)}
      </Box>
    </Box>
  )
}

const trackLabel = {
  flex: 'none',
  fontSize: tokens.font.size.micro,
  color: tokens.ink.secondary,
  fontVariantNumeric: 'tabular-nums',
} as const
/** 2a's 4 px track: grey for the range, blue for the 7 days on the map (under the slider, whose own rail is hidden). */
const trackBar = {
  position: 'absolute',
  top: '50%',
  height: 4,
  mt: '-2px',
  borderRadius: `${tokens.radius.bar}px`,
} as const

const KNOB = 14

/**
 * The slider with 44 px touch targets (SPEC §11): the slider's hit area and the thumb are tapTarget tall, while the
 * thumb draws 2a's 14 px white knob with a 2 px blue ring (its ::before), a soft halo on hover and drag, and a focus
 * ring on keyboard focus.
 */
const sliderSx = {
  display: 'block',
  color: tokens.accent.main,
  py: `${(tokens.tapTarget - 4) / 2}px`,
  '& .MuiSlider-rail': { opacity: 0 },
  '& .MuiSlider-thumb': {
    width: tokens.tapTarget,
    height: tokens.tapTarget,
    bgcolor: 'transparent',
    '&::before': {
      width: KNOB,
      height: KNOB,
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      boxSizing: 'border-box',
      bgcolor: tokens.ink.card,
      border: `2px solid ${tokens.accent.main}`,
      boxShadow: 'none',
    },
    '&::after': { width: tokens.tapTarget, height: tokens.tapTarget },
    '&:hover, &.Mui-focusVisible, &.Mui-active': { boxShadow: 'none' },
    '&:hover::before': { boxShadow: `0 0 0 6px ${withAlpha(tokens.accent.main, 0.16)}` },
    '&.Mui-active::before': { boxShadow: `0 0 0 10px ${withAlpha(tokens.accent.main, 0.16)}` },
    '&.Mui-focusVisible::before': {
      boxShadow: `0 0 0 2px ${tokens.ink.card}, 0 0 0 4px ${tokens.accent.main}`,
    },
    // The knob's own ring is the focus indicator; the theme's outline around the 44 px hit box would be a second ring.
    '&.Mui-focusVisible': { outline: 'none' },
  },
  // 2a's dark tooltip, over the knob (the thumb box is taller than the knob it draws).
  '& .MuiSlider-valueLabel': {
    top: (tokens.tapTarget - KNOB) / 2 - 10,
    bgcolor: tokens.dark.bg,
    color: tokens.dark.text,
    borderRadius: `${tokens.radius.control}px`,
    py: '6px',
    px: '10px',
    fontSize: tokens.font.size.caption,
    fontWeight: tokens.font.weight.label,
  },
} as const
