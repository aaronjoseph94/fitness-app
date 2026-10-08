// Owns: fasting on the Log tab — the month's planned count against the rail, the next planned fast (its day, length and
// start) with every later planned one after it, a 14-day strip around today (planned, completed and partial fasts by
// their fast day; tap a fast for its date, status and hours), and the history list (a planned fast never ended opens the
// fast sheet to resolve it: its real end, or "Didn't fast"; a fast ended within an hour of its start — a mis-tap — can be
// removed, so it no longer counts toward the month's fasts).
import TimerOutlined from '@mui/icons-material/TimerOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import { fastDay } from '@fitness/shared/engine'
import { endpoints } from '@fitness/shared/api'
import { useState } from 'react'
import { fastLook } from '../../../charts'
import { formatClock, formatNumber, formatShortDate, formatWeekday, LoadProblem, PendingBadge } from '../../../components'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'
import { dateOf, formatDateTime, fastsInMonth, shiftDate, useFasts, useLogMutation, useLogSettings, useNow, type FastView } from '../../quick-log'
import { dayLabel, longDayLabel } from './labels'
import { CardMeta, LoadingRows, LogCard } from './LogCard'

const HISTORY_MAX = 6
/** A fast ended this soon after it started is a mis-tap the Worker lets you remove (DELETE /api/fasts/:id). */
const MISTAP_H = 1
/** The strip: ten days back to three ahead of today (2a's 14 cells). */
const STRIP_BACK = 10
const STRIP_DAYS = 14
/** On touch, a fast's hit area is 44 × 44 centred on its cell (insets from the padding box, so the border doesn't shrink it). */
const TOUCH_REACH = `calc(50% - ${tokens.tapTarget / 2}px)`

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
  const dayOf = (f: FastView) => fastDay({ started_at: f.startedAt, ended_at: f.endedAt }, fastHours) ?? dateOf(f.startedAt)
  const [next, ...later] = fasting.fasts.filter((f) => f.status === 'planned').sort((a, b) => a.startedAt.localeCompare(b.startedAt))

  return (
    <LogCard
      title="Fasting"
      icon={TimerOutlined}
      iconColor={tokens.tone.warning.text}
      meta={
        <>
          {anyPending && <PendingBadge />}
          <CardMeta>{`${formatNumber(planned)} of ${formatNumber(fastsPerMonth)} planned this month`}</CardMeta>
        </>
      }
      testId="log-fasting"
    >
      {fasting.isLoading && fasting.fasts.length === 0 ? (
        <LoadingRows rows={2} />
      ) : fasting.error != null && fasting.fasts.length === 0 ? (
        <LoadProblem what="Your fasts" error={fasting.error} onRetry={fasting.refetch} />
      ) : (
        <>
          {next && (
            <Box sx={{ px: 3, py: '10px', borderRadius: `${tokens.radius.control}px`, bgcolor: tokens.tone.warning.bg, fontSize: tokens.font.size.small, mb: 3 }}>
              <Box component="b" sx={{ color: tokens.tone.warning.deep, fontWeight: tokens.font.weight.heading }}>
                Next: {longDayLabel(dayOf(next))}
              </Box>
              <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.tone.warning.text, fontVariantNumeric: 'tabular-nums' }}>
                {formatNumber(fastHours)} h from {formatClock(next.startedAt)} {formatWeekday(dateOf(next.startedAt))}
              </Box>
              {later.length > 0 && (
                <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.tone.warning.text, fontVariantNumeric: 'tabular-nums' }}>
                  Then: {later.map((f) => longDayLabel(dayOf(f))).join(' · ')}
                </Box>
              )}
            </Box>
          )}
          <FastStrip fasts={fasting.fasts} today={today} dayOf={dayOf} />
          {history.length > 0 && (
            <Box component="ul" aria-label="Fasting history" sx={{ listStyle: 'none', p: 0, m: 0, mt: 3, display: 'grid' }}>
              {history.map((f) => (
                <Box
                  component="li"
                  key={f.id}
                  sx={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: 36, fontSize: tokens.font.size.caption, borderTop: `1px solid ${tokens.ink.hairline}` }}
                >
                  <Box sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatDateTime(f.startedAt)}</Box>
                  <Box sx={{ flex: 1, color: tokens.ink.secondary }}>{STATUS_TEXT[f.status]}</Box>
                  {f.status === 'missed' && (
                    <Button size="tiny" variant="text" onClick={onPlan} data-testid="fast-resolve">
                      Resolve
                    </Button>
                  )}
                  {f.status === 'partial' && f.hours !== null && f.hours < MISTAP_H && !f.pending && (
                    <Button size="tiny" variant="text" onClick={() => remove.mutate({ params: { id: f.id } })} disabled={remove.isPending} data-testid="fast-remove">
                      Remove
                    </Button>
                  )}
                  {f.pending && <PendingBadge />}
                  <Box sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: tokens.font.weight.label }}>{f.hours !== null ? `${formatNumber(f.hours, 1)} h` : '—'}</Box>
                </Box>
              ))}
            </Box>
          )}
          {fasting.fasts.length === 0 && (
            <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary, mt: 3 }}>No fasts yet. Plan the month's two on the dates that suit you.</Box>
          )}
        </>
      )}
      <Button variant="outlined" size="tiny" onClick={onPlan} sx={{ mt: 3 }}>
        Plan a fast
      </Button>
    </LogCard>
  )
}

/**
 * 2a's fasting strip: one cell per day, today dark, a planned fast dashed amber, completed / partial in the fasting slate
 * (the chart kit's `fastLook`, shared with every fasting day strip; a running fast looks partial). A day with a fast is
 * a button: tapping it puts its date, status and hours in the line under the strip (the kit's FastingStrip tap caption),
 * in place of the range labels.
 */
function FastStrip({ fasts, today, dayOf }: { fasts: readonly FastView[]; today: string; dayOf: (f: FastView) => string }) {
  const [selected, setSelected] = useState<string | null>(null)
  const first = shiftDate(today, -STRIP_BACK)
  const days = Array.from({ length: STRIP_DAYS }, (_, i) => shiftDate(first, i))
  const last = days[days.length - 1] ?? today
  const byDay = new Map(fasts.map((f) => [dayOf(f), f]))
  const shown = days.flatMap((d) => byDay.get(d) ?? [])
  const summary = shown.length === 0 ? 'no fasts' : shown.map((f) => `${STATUS_TEXT[f.status].toLowerCase()} ${formatShortDate(dayOf(f))}`).join(', ')
  const detail = (d: string, f: FastView) => `${dayLabel(d)} · ${STATUS_TEXT[f.status]}${f.hours !== null ? ` · ${formatNumber(f.hours, 1)} h` : ''}`
  const pick = selected !== null ? byDay.get(selected) : undefined
  return (
    <Box>
      <Box
        role="group"
        aria-label={`Fasting, ${formatShortDate(first)} to ${formatShortDate(last)}: ${summary}`}
        data-testid="chart-fasting"
        sx={{ display: 'grid', gridTemplateColumns: `repeat(${STRIP_DAYS}, minmax(0, 1fr))`, gap: '3px' }}
      >
        {days.map((d, i) => {
          const f = byDay.get(d)
          const status = f?.status
          const isToday = d === today
          const look = status ? fastLook(status === 'active' ? 'partial' : status) : undefined
          const cellSx = {
            height: 18,
            minWidth: 0,
            boxSizing: 'border-box',
            borderRadius: `${tokens.chart.barRadius}px`,
            bgcolor: look?.fill ?? (look?.dashed ? 'transparent' : isToday ? tokens.dark.bg : tokens.ink.fill),
            border: look?.dashed ? `1.5px dashed ${look.dashed}` : undefined,
            boxShadow: d === selected ? `inset 0 0 0 1.5px ${tokens.ink.text}` : f && isToday ? `inset 0 0 0 1.5px ${tokens.dark.bg}` : undefined,
          } as const
          if (!f) return <Box key={d} aria-hidden sx={cellSx} />
          // Beside another fast the hit area stops at the 3 px gap, so a tap on one fast's cell never lands on its neighbour.
          const side = (n: string | undefined) => (n !== undefined && byDay.has(n) ? '-3px' : TOUCH_REACH)
          return (
            <ButtonBase
              key={d}
              aria-label={detail(d, f)}
              aria-pressed={d === selected}
              onClick={() => setSelected((s) => (s === d ? null : d))}
              sx={{
                ...cellSx,
                position: 'relative',
                // The 18 px cell stays as drawn; on touch its hit area is 44 × 44 around it.
                [COARSE_POINTER_QUERY]: { '&::after': { content: '""', position: 'absolute', top: TOUCH_REACH, bottom: TOUCH_REACH, left: side(days[i - 1]), right: side(days[i + 1]) } },
              }}
            />
          )
        })}
      </Box>
      <Box aria-live="polite" sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mt: 1, minHeight: 18, fontSize: tokens.font.size.micro, lineHeight: '18px', color: tokens.ink.secondary }}>
        {pick && selected !== null ? (
          <Box component="span" sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.label, fontVariantNumeric: 'tabular-nums' }}>
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
