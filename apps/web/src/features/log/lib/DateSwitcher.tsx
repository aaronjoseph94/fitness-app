// Owns: the Log tab's date switcher (2a: an outline frame in the title row) — previous / next day (never past today),
// the neighbouring days by name, the day shown as a dark segment ("Today · Wed, Oct 7") which opens the native date
// picker, and a "Today" jump when looking at another day.
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import TodayRounded from '@mui/icons-material/TodayRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import type { ChangeEvent } from 'react'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'
import { relativeDay, shiftDate } from '../../quick-log'
import { dayLabel, shortDayLabel } from './labels'

/** A neighbouring day's segment: 13/500 like a segmented control's, hidden on a phone where the chevrons do the job. */
const neighbourSx = {
  display: { xs: 'none', sm: 'inline-flex' },
  px: '12px',
  fontSize: tokens.font.size.small,
  color: tokens.ink.label,
  borderRadius: `${tokens.radius.inner}px`,
  fontVariantNumeric: 'tabular-nums',
  '&.Mui-disabled': { color: tokens.ink.disabled },
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
  const label = relative === 'Today' || relative === 'Yesterday' ? `${relative} · ${dayLabel(date)}` : dayLabel(date)
  return (
    <Box
      data-testid="date-switcher"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        p: '3px',
        maxWidth: '100%',
        border: `1px solid ${tokens.ink.border}`,
        borderRadius: `${tokens.radius.segmentTrack}px`,
        bgcolor: tokens.ink.card,
      }}
    >
      <IconButton size="small" aria-label="Previous day" onClick={() => onChange(previous)} sx={{ borderRadius: `${tokens.radius.inner}px` }}>
        <ChevronLeftRounded sx={{ fontSize: 18 }} />
      </IconButton>
      <Button variant="text" color="inherit" size="tiny" onClick={() => onChange(previous)} sx={neighbourSx}>
        {shortDayLabel(previous)}
      </Button>
      <Box
        sx={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          minHeight: 30,
          px: '12px',
          minWidth: 0,
          borderRadius: `${tokens.radius.inner}px`,
          bgcolor: tokens.dark.bg,
          color: tokens.dark.text,
          fontSize: tokens.font.size.small,
          fontWeight: tokens.font.weight.label,
          lineHeight: 1.4,
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
          [COARSE_POINTER_QUERY]: { minHeight: tokens.tapTarget },
          // The input is invisible, so its keyboard focus ring is drawn on the segment it covers.
          '&:has(input:focus-visible)': {
            outline: `${tokens.focusRing.width}px solid ${tokens.focusRing.color}`,
            outlineOffset: tokens.focusRing.offset,
          },
        }}
      >
        <TodayRounded aria-hidden sx={{ fontSize: 16 }} />
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
      <Button variant="text" color="inherit" size="tiny" onClick={() => onChange(next)} disabled={isToday} sx={neighbourSx}>
        {shortDayLabel(next)}
      </Button>
      <IconButton size="small" aria-label="Next day" onClick={() => onChange(next)} disabled={isToday} sx={{ borderRadius: `${tokens.radius.inner}px` }}>
        <ChevronRightRounded sx={{ fontSize: 18 }} />
      </IconButton>
      {!isToday && (
        <Button size="tiny" variant="text" onClick={() => onChange(today)} sx={{ fontSize: tokens.font.size.small }}>
          Today
        </Button>
      )}
    </Box>
  )
}
