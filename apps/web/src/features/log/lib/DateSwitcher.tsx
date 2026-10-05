// Owns: the Log tab's date switcher — previous / next day (never past today), the day as "Today · 2026-10-05" which
// opens the native date picker, and a "Today" jump when looking at another day. Sticks under the top bar.
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import type { ChangeEvent } from 'react'
import { tokens } from '../../../theme'
import { relativeDay, shiftDate } from '../../quick-log'

/** The shell's sticky top bar: one tap target plus 12 px. */
const TOP_BAR = tokens.tapTarget + tokens.space(3)

export function DateSwitcher({ date, today, onChange }: { date: string; today: string; onChange: (date: string) => void }) {
  const isToday = date === today
  return (
    <Box
      data-testid="date-switcher"
      sx={{
        position: 'sticky',
        top: `calc(${TOP_BAR}px + env(safe-area-inset-top, 0px))`,
        zIndex: 2,
        bgcolor: 'background.default',
        mx: -1,
        px: 1,
        py: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
      }}
    >
      <IconButton aria-label="Previous day" onClick={() => onChange(shiftDate(date, -1))}>
        <ChevronLeftRounded />
      </IconButton>
      <Box sx={{ position: 'relative', flex: 1, minWidth: 0, textAlign: 'center', minHeight: tokens.tapTarget, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.heading, lineHeight: 1.2 }}>{relativeDay(date, today)}</Box>
        <Box sx={{ fontSize: tokens.font.size.label, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{date}</Box>
        {/* The native picker sits invisibly over the label so a tap opens it on iOS and Android. */}
        <Box
          component="input"
          type="date"
          aria-label="Pick a day"
          value={date}
          max={today}
          onChange={(e: ChangeEvent<HTMLInputElement>) => e.target.value && onChange(e.target.value > today ? today : e.target.value)}
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 0, p: 0 }}
        />
      </Box>
      {!isToday && (
        <Button size="small" variant="text" onClick={() => onChange(today)} sx={{ minWidth: 0, px: 2 }}>
          Today
        </Button>
      )}
      <IconButton aria-label="Next day" onClick={() => onChange(shiftDate(date, 1))} disabled={isToday}>
        <ChevronRightRounded />
      </IconButton>
    </Box>
  )
}
