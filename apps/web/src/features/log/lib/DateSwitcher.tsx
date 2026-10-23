// Owns: the Log tab's date switcher on the sky (1d Summit: a glass pill — ‹ Tue 6 · Today · Thu 8 › — with the next day
// disabled on today) — previous / next day (never past today), the neighbouring days by name, the day shown as the white
// segment ("Today", "Yesterday" or "Wed, Oct 7") which opens the native date picker, and a "Today" jump beside the pill
// when looking at another day (a glass button of the hero's own, so it wraps under the pill on a phone).
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import type { ChangeEvent } from 'react'
import { formatDay } from '../../../components'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'
import { relativeDay, shiftDate } from '../../quick-log'
import { shortDayLabel } from './labels'

const { summit, font } = tokens

/** The keyboard ring on the sky: white, so it reads on the glass (the theme's violet ring would not). */
const onSkyFocus = {
  '&.Mui-focusVisible': {
    outline: `${tokens.focusRing.width}px solid ${summit.onSky.text}`,
    outlineOffset: tokens.focusRing.offset,
  },
} as const

/** A 36 px round glass button (44 on touch). */
const chevronSx = {
  width: 36,
  height: 36,
  flex: 'none',
  borderRadius: '50%',
  color: summit.onSky.text,
  '&:hover': { bgcolor: summit.glass.fillHover },
  '&.Mui-disabled': { color: summit.onSky.disabled },
  ...onSkyFocus,
  [COARSE_POINTER_QUERY]: { width: tokens.tapTarget, height: tokens.tapTarget },
} as const

/** A neighbouring day's segment: 14/600 on the glass; the next day fades out while it would pass today. */
const neighbourSx = {
  minHeight: 36,
  px: '12px',
  flex: 'none',
  borderRadius: `${summit.radius.pill}px`,
  fontSize: 14,
  fontWeight: font.weight.heading,
  color: summit.onSky.subtitle,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
  '&:hover': { bgcolor: summit.glass.fillHover },
  '&.Mui-disabled': { color: summit.onSky.disabled },
  ...onSkyFocus,
  [COARSE_POINTER_QUERY]: { minHeight: tokens.tapTarget },
  // A 360 px phone keeps the chevrons and the day; the neighbours' names go (the chevrons do the same job).
  '@media (max-width: 374.95px)': { display: 'none' },
} as const

export function DateSwitcher({
  date,
  today,
  onChange,
}: {
  date: string
  today: string
  onChange: (date: string) => void
}) {
  const isToday = date === today
  const previous = shiftDate(date, -1)
  const next = shiftDate(date, 1)
  const relative = relativeDay(date, today)
  const label = relative === 'Today' || relative === 'Yesterday' ? relative : formatDay(date)
  return (
    <>
      <Box
        data-testid="date-switcher"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          p: '5px',
          maxWidth: '100%',
          minWidth: 0,
          borderRadius: `${summit.radius.pill}px`,
          bgcolor: summit.glass.control,
          border: `1px solid ${summit.glass.controlBorder}`,
          backdropFilter: `blur(${summit.glass.blur}px)`,
        }}
      >
        <ButtonBase aria-label="Previous day" onClick={() => onChange(previous)} sx={chevronSx}>
          <ChevronLeftRounded sx={{ fontSize: 20 }} />
        </ButtonBase>
        <ButtonBase onClick={() => onChange(previous)} sx={neighbourSx}>
          {shortDayLabel(previous)}
        </ButtonBase>
        <Box
          sx={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            minHeight: 36,
            px: '16px',
            minWidth: 0,
            borderRadius: `${summit.radius.pill}px`,
            bgcolor: summit.avatar.bg,
            color: summit.avatar.text,
            fontSize: 14,
            fontWeight: font.weight.heading,
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
            [COARSE_POINTER_QUERY]: { minHeight: tokens.tapTarget },
            // The input is invisible, so its keyboard focus ring is drawn on the segment it covers.
            '&:has(input:focus-visible)': {
              outline: `${tokens.focusRing.width}px solid ${summit.onSky.text}`,
              outlineOffset: tokens.focusRing.offset,
            },
          }}
        >
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {label}
          </Box>
          {/* The native picker sits invisibly over the segment so a tap opens it on iOS and Android. */}
          <Box
            component="input"
            type="date"
            aria-label="Pick a day"
            value={date}
            max={today}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              e.target.value && onChange(e.target.value > today ? today : e.target.value)
            }
            sx={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              opacity: 0,
              cursor: 'pointer',
              border: 0,
              p: 0,
            }}
          />
        </Box>
        <ButtonBase onClick={() => onChange(next)} disabled={isToday} sx={neighbourSx}>
          {shortDayLabel(next)}
        </ButtonBase>
        <ButtonBase aria-label="Next day" onClick={() => onChange(next)} disabled={isToday} sx={chevronSx}>
          <ChevronRightRounded sx={{ fontSize: 20 }} />
        </ButtonBase>
      </Box>
      {!isToday && (
        <Button variant="outlined" onClick={() => onChange(today)}>
          Today
        </Button>
      )}
    </>
  )
}
