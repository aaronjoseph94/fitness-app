// Owns: the rest timer (2a's floating dark bar) — countdown from the ticked exercise's rest (template rest_sec), what
// comes next ("then Seated Cable Rows, set 2"), a shrinking progress bar, +30 s and Skip rest; when it reaches zero it
// says so, buzzes and fires the local notification (rest.ts), then clears itself. The countdown is an end time in the
// persisted store, so it survives a reload. It sticks to the bottom of the window inside the logger's column (above
// the bottom tabs on a phone) and rests after the logger's last row once scrolled there. The alert only fires while
// the page runs (iOS suspends a backgrounded PWA), so on a phone the bar says to keep the app open (its captions wrap
// to two lines there rather than clip).
import TimerOutlined from '@mui/icons-material/TimerOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { useEffect, useRef, useState } from 'react'
import { tokens } from '../../../theme'
import { useLoggerStore } from './logger-store'
import { notifyRestOver } from './rest'

const DONE_SHOWN_MS = 4000

/** A 12 px caption: one line from `sm`, up to two lines on a phone, where the row is narrow. */
const CAPTION_SX = {
  fontSize: tokens.font.size.caption,
  lineHeight: 1.4,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: { xs: 'normal', sm: 'nowrap' },
  display: { xs: '-webkit-box', sm: 'block' },
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: { xs: 2, sm: 'none' },
} as const

function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export interface RestTimerBarProps {
  sessionId: string
  /** Name of the exercise whose set started the rest. */
  nameOf: (exerciseId: string) => string
  /** The set to do after this rest ("Seated Cable Rows, set 2"); null when every set is ticked. */
  upNext: (exerciseId: string) => string | null
}

export function RestTimerBar({ sessionId, nameOf, upNext }: RestTimerBarProps) {
  const rest = useLoggerStore((s) => (s.rest?.session_id === sessionId ? s.rest : null))
  const extendRest = useLoggerStore((s) => s.extendRest)
  const clearRest = useLoggerStore((s) => s.clearRest)
  const [now, setNow] = useState(() => Date.now())
  const fired = useRef<number | null>(null)

  useEffect(() => {
    if (!rest) return
    const tick = () => setNow(Date.now())
    tick()
    const timer = setInterval(tick, 250)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [rest])

  const remaining = rest ? rest.ends_at - now : 0
  const over = rest !== null && remaining <= 0

  const nextName = useRef('')
  nextName.current = rest ? nameOf(rest.exercise_id) : ''
  const endsAt = rest?.ends_at ?? null

  useEffect(() => {
    if (endsAt === null || !over) return
    if (fired.current !== endsAt) {
      fired.current = endsAt
      // A rest that ended long ago (the app was closed) is cleared quietly.
      if (Date.now() - endsAt < 60_000) void notifyRestOver(`Next set: ${nextName.current}`)
    }
    const t = setTimeout(clearRest, DONE_SHOWN_MS)
    return () => clearTimeout(t)
  }, [endsAt, over, clearRest])

  if (!rest) return null
  const left = Math.min(100, Math.max(0, (remaining / (rest.total_sec * 1000)) * 100))
  const next = upNext(rest.exercise_id)

  return (
    <Box
      sx={{
        position: 'sticky',
        bottom: {
          xs: `calc(${tokens.layout.bottomNavHeight + tokens.space(2)}px + env(safe-area-inset-bottom, 0px))`,
          md: `calc(${tokens.space(6)}px + env(safe-area-inset-bottom, 0px))`,
        },
        zIndex: 'speedDial',
        mt: 4,
        displayPrint: 'none',
      }}
    >
      <Box
        role="timer"
        aria-live={over ? 'assertive' : 'off'}
        data-testid="rest-timer"
        sx={{
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          gap: { xs: 3, sm: 4 },
          py: '12px',
          pl: '18px',
          pr: { xs: '12px', sm: '16px' },
          borderRadius: `${tokens.radius.card}px`,
          bgcolor: over ? tokens.tone.success.text : tokens.dark.bg,
          color: tokens.dark.text,
          boxShadow: tokens.elevation.floating,
        }}
      >
        {/* From `sm`: on a phone the captions need the room more than the glyph does. */}
        <TimerOutlined
          aria-hidden
          sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 22, flex: 'none', color: over ? tokens.dark.text : tokens.accent.bright }}
        />
        <Box sx={{ flex: { xs: 1, sm: 'none' }, minWidth: 0, maxWidth: { sm: '40%' } }}>
          <Box sx={{ ...CAPTION_SX, color: over ? tokens.dark.text : tokens.dark.muted }}>
            {over
              ? `Next set: ${next ?? nameOf(rest.exercise_id)}`
              : next
                ? `Rest · then ${next}`
                : `Rest · ${nameOf(rest.exercise_id)}`}
          </Box>
          <Box
            sx={{
              fontSize: tokens.font.size.bigNumberSmall,
              fontWeight: tokens.font.weight.number,
              letterSpacing: tokens.font.em.number,
              lineHeight: 1.2,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {over ? 'Rest over' : clock(remaining)}
          </Box>
          {!over && (
            <Box sx={{ ...CAPTION_SX, display: { xs: '-webkit-box', sm: 'none' }, color: tokens.dark.muted }}>
              Keep the app open for the alert
            </Box>
          )}
        </Box>
        {!over && (
          // 6 px in the row from `sm`; a 3 px line along the top edge on a phone, where the row has no room.
          <Box
            aria-hidden
            sx={{
              flex: 1,
              height: { xs: 3, sm: 6 },
              position: { xs: 'absolute', sm: 'static' },
              top: 0,
              left: 0,
              right: 0,
              borderRadius: { sm: `${tokens.radius.pill}px` },
              bgcolor: tokens.dark.hover,
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                width: `${left}%`,
                height: '100%',
                borderRadius: { sm: `${tokens.radius.pill}px` },
                bgcolor: tokens.accent.bright,
                transition: 'width 250ms linear',
              }}
            />
          </Box>
        )}
        {!over && (
          <Button
            variant="outlined"
            size="dense"
            onClick={() => extendRest(30)}
            sx={{
              flex: 'none',
              px: '12px',
              bgcolor: 'transparent',
              color: tokens.dark.text,
              borderColor: tokens.dark.border,
              '&:hover': { bgcolor: tokens.dark.hover, borderColor: tokens.dark.border },
            }}
          >
            +30 s
          </Button>
        )}
        <Button
          variant="contained"
          size="dense"
          onClick={clearRest}
          sx={{
            flex: 'none',
            // Right-aligned also when the rest is over and the progress bar, which fills the row, has gone.
            ml: 'auto',
            bgcolor: tokens.dark.text,
            color: tokens.dark.bg,
            fontWeight: tokens.font.weight.heading,
            '&:hover': { bgcolor: tokens.ink.fill },
          }}
        >
          {over ? 'OK' : 'Skip rest'}
        </Button>
      </Box>
    </Box>
  )
}
