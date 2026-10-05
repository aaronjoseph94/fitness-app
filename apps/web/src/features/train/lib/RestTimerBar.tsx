// Owns: the rest timer's sticky bar above the bottom tabs — countdown from the ticked exercise's rest (template
// rest_sec), a progress line, +30 s and Skip; when it reaches zero it says so, buzzes and fires the local notification
// (rest.ts), then clears itself. The countdown is an end time in the persisted store, so it survives a reload. The
// alert only fires while the page runs (iOS suspends a backgrounded PWA), so the bar says to keep the app open.
import TimerOutlined from '@mui/icons-material/TimerOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import LinearProgress from '@mui/material/LinearProgress'
import { useEffect, useRef, useState } from 'react'
import { tokens } from '../../../theme'
import { useLoggerStore } from './logger-store'
import { notifyRestOver } from './rest'

const DONE_SHOWN_MS = 4000

function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export interface RestTimerBarProps {
  sessionId: string
  /** Name of the exercise whose set started the rest. */
  nameOf: (exerciseId: string) => string
}

export function RestTimerBar({ sessionId, nameOf }: RestTimerBarProps) {
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
  const progress = Math.min(100, Math.max(0, 100 - (remaining / (rest.total_sec * 1000)) * 100))

  return (
    <Box
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: `calc(${tokens.layout.bottomNavHeight + tokens.space(2)}px + env(safe-area-inset-bottom, 0px))`,
        zIndex: 'speedDial',
        px: `${tokens.space(4)}px`,
        displayPrint: 'none',
      }}
    >
      <Box
        role="timer"
        aria-live={over ? 'assertive' : 'off'}
        data-testid="rest-timer"
        sx={{
          maxWidth: 600 - tokens.space(8),
          mx: 'auto',
          position: 'relative',
          overflow: 'hidden',
          borderRadius: `${tokens.radius.card}px`,
          bgcolor: over ? tokens.status.good : tokens.ink.text,
          color: tokens.ink.card,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          pl: 4,
          pr: 1,
          minHeight: 60,
        }}
      >
        {!over && (
          <LinearProgress
            variant="determinate"
            value={progress}
            aria-hidden
            sx={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              height: 3,
              bgcolor: 'transparent',
              '& .MuiLinearProgress-bar': { bgcolor: tokens.muscleMap.steps[1] },
            }}
          />
        )}
        <TimerOutlined aria-hidden />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, minWidth: 0 }}>
            <Box
              sx={{
                fontSize: 24,
                fontWeight: tokens.font.weight.number,
                lineHeight: 1.1,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {over ? 'Rest over' : clock(remaining)}
            </Box>
            {!over && (
              <Box sx={{ fontSize: tokens.font.size.caption, opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Keep the app open for the alert
              </Box>
            )}
          </Box>
          <Box
            sx={{
              fontSize: tokens.font.size.caption,
              opacity: 0.8,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {over ? `Next set: ${nameOf(rest.exercise_id)}` : `Rest · ${nameOf(rest.exercise_id)}`}
          </Box>
        </Box>
        {!over && (
          <Button onClick={() => extendRest(30)} sx={{ color: 'inherit', minWidth: 56 }}>
            +30 s
          </Button>
        )}
        <Button onClick={clearRest} sx={{ color: 'inherit', minWidth: 56 }}>
          {over ? 'OK' : 'Skip'}
        </Button>
      </Box>
    </Box>
  )
}
