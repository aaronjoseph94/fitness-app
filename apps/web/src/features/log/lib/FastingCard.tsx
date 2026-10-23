// Owns: fasting on the Log tab (1d Summit: the screen's deep-sky card) — the month's planned count against the rail, the
// next planned fast (its day, length and start) with every later planned one after it in a well, a 14-day strip around
// today (today gold; completed fasts coral, partial ones half coral, planned ones a dashed coral outline, by their fast
// day; tap a fast for its date, status and hours), and the history list (a planned fast never ended opens the fast sheet
// to resolve it: its real end, or "Didn't fast"; a fast ended within an hour of its start — a mis-tap — can be removed,
// so it no longer counts toward the month's fasts).
import TimerOutlined from '@mui/icons-material/TimerOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import { fastDay } from '@fitness/shared/engine'
import { endpoints } from '@fitness/shared/api'
import { useState } from 'react'
import {
  formatClock,
  formatDay,
  formatDayTime,
  formatNumber,
  formatShortDate,
  formatWeekday,
  LoadProblem,
  PendingBadge,
} from '../../../components'
import { COARSE_POINTER_QUERY, tokens, withAlpha } from '../../../theme'
import {
  dateOf,
  fastWindowLabel,
  fastsInMonth,
  shiftDate,
  useFasts,
  useLogMutation,
  useLogSettings,
  useNow,
  type FastView,
} from '../../quick-log'
import { longDayLabel } from './labels'
import { CardMeta, LoadingRows, LogCard } from './LogCard'

const HISTORY_MAX = 6
const HOUR_MS = 3_600_000
/** A fast ended this soon after it started is a mis-tap the Worker lets you remove (DELETE /api/fasts/:id). */
const MISTAP_H = 1
/** The strip: ten days back to three ahead of today (2a's 14 cells). */
const STRIP_BACK = 10
const STRIP_DAYS = 14
/** A fast's hit area is 24 px tall centred on its 12 px cell (WCAG 2.5.8), 44 × 44 on touch (insets from the padding
 * box, so the border doesn't shrink it). */
const POINTER_REACH = 'calc(50% - 12px)'
const TOUCH_REACH = `calc(50% - ${tokens.tapTarget / 2}px)`

const { summit } = tokens
const coral = summit.coral.main

/** The white button on the deep sky (deep ink on white, 16.4:1): "Plan a fast". */
const onDarkButtonSx = {
  bgcolor: summit.avatar.bg,
  color: summit.avatar.text,
  '&:hover': { bgcolor: summit.avatar.hover },
  '&.Mui-focusVisible': { outlineColor: summit.gold.main },
} as const

/** A text button on the deep sky: gold (11.5:1). */
const onDarkTextSx = {
  color: summit.gold.main,
  '&:hover': { bgcolor: summit.deepSky.well },
  '&.Mui-focusVisible': { outlineColor: summit.gold.main },
} as const

/** A strip cell's look on the deep sky, by what the day holds. */
function cellLook(status: FastView['status'] | undefined, isToday: boolean) {
  if (status === 'completed') return { bgcolor: coral }
  if (status === 'partial' || status === 'active') return { bgcolor: withAlpha(coral, 0.55) }
  if (status === 'planned') return { bgcolor: 'transparent', border: `1.5px dashed ${coral}` }
  if (status === 'missed') return { bgcolor: 'transparent', border: `1.5px dashed ${summit.onSky.disabled}` }
  return { bgcolor: isToday ? summit.gold.main : summit.glass.border }
}

function monthStart(date: string, deltaMonths: number): string {
  const [y, m] = date.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m - 1 + deltaMonths, 1))
  return d.toISOString().slice(0, 10)
}

function monthEnd(date: string, deltaMonths: number): string {
  const [y, m] = date.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m + deltaMonths, 0)).toISOString().slice(0, 10)
}

const STATUS_TEXT: Record<FastView['status'], string> = {
  active: 'Running',
  planned: 'Planned',
  completed: 'Completed',
  partial: 'Partial',
  missed: 'Never ended',
}

export function FastingCard({ today, onPlan }: { today: string; onPlan: () => void }) {
  const now = useNow(60_000)
  const { fastHours, fastsPerMonth } = useLogSettings()
  const from = monthStart(today, -2)
  const to = monthEnd(today, 2)
  const fasting = useFasts({ from, to }, now)
  const remove = useLogMutation(endpoints.fasting.cancel)

  const history = fasting.fasts.filter((f) => f.status !== 'planned').slice(0, HISTORY_MAX)
  const planned = fastsInMonth(fasting.fasts, today, fastHours)
  const anyPending = fasting.fasts.some((f) => f.pending)
  const dayOf = (f: FastView) =>
    fastDay({ started_at: f.startedAt, ended_at: f.endedAt }, fastHours) ?? dateOf(f.startedAt)
  const [next, ...later] = fasting.fasts
    .filter((f) => f.status === 'planned')
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))

  return (
    <LogCard
      title="Fasting"
      tone="deep"
      icon={TimerOutlined}
      iconColor={coral}
      meta={
        <>
          {anyPending && <PendingBadge />}
          <CardMeta>{`${formatNumber(planned)} of ${formatNumber(fastsPerMonth)} planned this month`}</CardMeta>
        </>
      }
      testId="log-fasting"
    >
      {fasting.isLoading && fasting.fasts.length === 0 ? (
        <LoadingRows rows={2} onDark />
      ) : fasting.error != null && fasting.fasts.length === 0 ? (
        <LoadProblem what="Your fasts" error={fasting.error} onRetry={fasting.refetch} />
      ) : (
        <>
          {next && (
            <Box
              sx={{
                px: '14px',
                py: '12px',
                mb: '14px',
                borderRadius: `${summit.radius.wellSmall}px`,
                bgcolor: summit.deepSky.well,
                fontSize: tokens.font.size.body,
                fontWeight: tokens.font.weight.body,
                lineHeight: 1.45,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <div data-testid="fast-next">
                Next: {fastWindowLabel(next.startedAt, Date.parse(next.startedAt) + fastHours * HOUR_MS, now)}
              </div>
              <Box sx={{ color: summit.deepSky.muted }}>
                {formatNumber(fastHours)} h · fast day {longDayLabel(dayOf(next))}
              </Box>
              {later.length > 0 && (
                <Box sx={{ color: summit.deepSky.muted }}>
                  Then:{' '}
                  {later
                    .map(
                      (f) =>
                        `${formatWeekday(dateOf(f.startedAt))}, ${formatShortDate(dateOf(f.startedAt))} ${formatClock(f.startedAt)}`,
                    )
                    .join(' · ')}
                </Box>
              )}
            </Box>
          )}
          <FastStrip fasts={fasting.fasts} today={today} dayOf={dayOf} />
          {history.length > 0 && (
            <Box
              component="ul"
              aria-label="Fasting history"
              sx={{ listStyle: 'none', p: 0, m: 0, mt: '12px', display: 'grid' }}
            >
              {history.map((f) => (
                <Box
                  component="li"
                  key={f.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    minHeight: 36,
                    fontSize: tokens.font.size.small,
                    borderTop: `1px solid ${summit.deepSky.hairline}`,
                  }}
                >
                  <Box sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatDayTime(f.startedAt)}</Box>
                  <Box sx={{ flex: 1, color: summit.deepSky.muted }}>{STATUS_TEXT[f.status]}</Box>
                  {f.status === 'missed' && (
                    <Button
                      size="tiny"
                      variant="text"
                      onClick={onPlan}
                      data-testid="fast-resolve"
                      sx={onDarkTextSx}
                    >
                      Resolve
                    </Button>
                  )}
                  {f.status === 'partial' && f.hours !== null && f.hours < MISTAP_H && !f.pending && (
                    <Button
                      size="tiny"
                      variant="text"
                      onClick={() => remove.mutate({ params: { id: f.id } })}
                      disabled={remove.isPending}
                      data-testid="fast-remove"
                      sx={onDarkTextSx}
                    >
                      Remove
                    </Button>
                  )}
                  {f.pending && <PendingBadge />}
                  <Box sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: tokens.font.weight.label }}>
                    {f.hours !== null ? `${formatNumber(f.hours, 1)} h` : '—'}
                  </Box>
                </Box>
              ))}
            </Box>
          )}
          {fasting.fasts.length === 0 && (
            <Box sx={{ fontSize: tokens.font.size.small, color: summit.deepSky.muted, mt: '12px' }}>
              No fasts yet. Plan the month's two on the dates that suit you.
            </Box>
          )}
        </>
      )}
      <Button variant="contained" color="inherit" onClick={onPlan} sx={{ ...onDarkButtonSx, mt: '14px' }}>
        Plan a fast
      </Button>
    </LogCard>
  )
}

/**
 * 1d's fasting strip on the deep sky: one 12 px cell per day, today gold, a completed fast coral, a partial or running
 * one half coral, a planned one a dashed coral outline. A day with a fast is a button: tapping it puts its date, status
 * and hours in the line under the strip, in place of the range labels.
 */
function FastStrip({
  fasts,
  today,
  dayOf,
}: {
  fasts: readonly FastView[]
  today: string
  dayOf: (f: FastView) => string
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const first = shiftDate(today, -STRIP_BACK)
  const days = Array.from({ length: STRIP_DAYS }, (_, i) => shiftDate(first, i))
  const last = days[days.length - 1] ?? today
  const byDay = new Map(fasts.map((f) => [dayOf(f), f]))
  const shown = days.flatMap((d) => byDay.get(d) ?? [])
  const summary =
    shown.length === 0
      ? 'no fasts'
      : shown.map((f) => `${STATUS_TEXT[f.status].toLowerCase()} ${formatShortDate(dayOf(f))}`).join(', ')
  const detail = (d: string, f: FastView) =>
    `${formatDay(d)} · ${STATUS_TEXT[f.status]}${f.hours !== null ? ` · ${formatNumber(f.hours, 1)} h` : ''}`
  const pick = selected !== null ? byDay.get(selected) : undefined
  return (
    <Box>
      <Box
        role="group"
        aria-label={`Fasting, ${formatShortDate(first)} to ${formatShortDate(last)}: ${summary}`}
        data-testid="chart-fasting"
        sx={{ display: 'grid', gridTemplateColumns: `repeat(${STRIP_DAYS}, minmax(0, 1fr))`, gap: '4px' }}
      >
        {days.map((d, i) => {
          const f = byDay.get(d)
          const status = f?.status
          const isToday = d === today
          const cellSx = {
            height: 12,
            minWidth: 0,
            boxSizing: 'border-box',
            borderRadius: '3px',
            ...cellLook(status, isToday),
            boxShadow:
              d === selected
                ? `0 0 0 2px ${summit.deepSky.text}`
                : f && isToday
                  ? `0 0 0 2px ${summit.gold.main}`
                  : undefined,
          } as const
          if (!f) return <Box key={d} aria-hidden sx={cellSx} />
          // Beside another fast the hit area stops at the 4 px gap, so a tap on one fast's cell never lands on its neighbour.
          const side = (n: string | undefined) => (n !== undefined && byDay.has(n) ? '-4px' : TOUCH_REACH)
          return (
            <ButtonBase
              key={d}
              aria-label={detail(d, f)}
              aria-pressed={d === selected}
              onClick={() => setSelected((s) => (s === d ? null : d))}
              sx={{
                ...cellSx,
                position: 'relative',
                '&.Mui-focusVisible': { outlineColor: summit.gold.main },
                // The 12 px cell stays as drawn; its hit area is 24 px tall around it, 44 × 44 on touch.
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  top: POINTER_REACH,
                  bottom: POINTER_REACH,
                  left: 0,
                  right: 0,
                },
                [COARSE_POINTER_QUERY]: {
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    top: TOUCH_REACH,
                    bottom: TOUCH_REACH,
                    left: side(days[i - 1]),
                    right: side(days[i + 1]),
                  },
                },
              }}
            />
          )
        })}
      </Box>
      <Box
        aria-live="polite"
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 2,
          mt: '8px',
          minHeight: 18,
          fontSize: tokens.font.size.caption,
          lineHeight: '18px',
          color: summit.deepSky.muted,
        }}
      >
        {pick && selected !== null ? (
          <Box
            component="span"
            sx={{
              fontSize: tokens.font.size.caption,
              color: summit.deepSky.text,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {detail(selected, pick)}
          </Box>
        ) : (
          <>
            <span aria-hidden>{formatShortDate(first)}</span>
            <span aria-hidden>{formatShortDate(last)}</span>
          </>
        )}
      </Box>
    </Box>
  )
}
