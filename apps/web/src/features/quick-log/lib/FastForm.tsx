// Owns: the fast panel — a running fast's elapsed time against its planned length with "End fast" (and "Didn't fast"
// for a planned fast that started on its own); otherwise "Start fast now" (or start today's planned fast); a missed fast
// (planned, never ended) to resolve — "End at…" its real end, or "Didn't fast" — and "Plan a fast" (date + start time)
// with the month's planned count against the fasting rail (SPEC §6: two 24 h fasts a month on dates Aaron picks).
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import { endpoints } from '@fitness/shared/api'
import { fastDay } from '@fitness/shared/engine'
import { useState } from 'react'
import { formatNumber, LoadProblem, MetricRing, PendingBadge, statValue, tabularNums } from '../../../components'
import { tokens } from '../../../theme'
import { clockOf, dateOf, formatDateTime, formatDuration, instantAt, relativeDay, shiftDate, todayLocal } from './dates'
import { fastsInMonth, useFasts, useNow, type FastView } from './fasts'
import { useLogSettings } from './reads'
import { noticeFor, type LogNotice } from './ui'
import { useLogMutation } from './writes'
import { problemText } from '../../../api'

const HOUR_MS = 3_600_000
const DEFAULT_PLAN_TIME = '19:00'
/** A planned fast this close to now is offered as "Start planned fast". */
const START_SOON_MS = 12 * HOUR_MS

export function FastForm({ date, onLogged }: { date: string; onLogged: (notice: LogNotice) => void }) {
  const now = useNow(30_000)
  const today = todayLocal(now)
  const { fastHours, fastsPerMonth } = useLogSettings()
  const fasting = useFasts({ from: shiftDate(today, -3), to: shiftDate(today, 92) }, now)
  const start = useLogMutation(endpoints.fasting.start)
  const end = useLogMutation(endpoints.fasting.end)
  const cancel = useLogMutation(endpoints.fasting.cancel)
  const [planOpen, setPlanOpen] = useState(false)

  const { active, upcoming } = fasting
  const missed = fasting.fasts.find((f) => f.status === 'missed') ?? null
  const soon = upcoming.find((f) => Date.parse(f.startedAt) - now < START_SOON_MS)
  const error = start.error ?? end.error ?? cancel.error

  const startNow = (planned?: FastView) => {
    const startedAt = new Date().toISOString()
    start.mutate(
      { body: { id: planned?.id ?? crypto.randomUUID(), started_at: startedAt } },
      { onSuccess: (o) => onLogged(noticeFor(o, `Fast started at ${clockOf(startedAt)}`)) },
    )
  }
  const endNow = (fast: FastView) => {
    const endedAt = new Date().toISOString()
    end.mutate(
      { params: { id: fast.id }, body: { ended_at: endedAt } },
      { onSuccess: (o) => onLogged(noticeFor(o, `Fast ended after ${formatDuration(Date.parse(endedAt) - Date.parse(fast.startedAt))}`)) },
    )
  }
  const endAt = (fast: FastView, endedAt: string) => {
    end.mutate(
      { params: { id: fast.id }, body: { ended_at: endedAt } },
      { onSuccess: (o) => onLogged(noticeFor(o, `Fast recorded: ${formatDuration(Date.parse(endedAt) - Date.parse(fast.startedAt))}`)) },
    )
  }
  const didNotFast = (fast: FastView) => {
    cancel.mutate({ params: { id: fast.id } }, { onSuccess: (o) => onLogged(noticeFor(o, `Fast of ${formatDateTime(fast.startedAt)} removed`)) })
  }

  return (
    <Box sx={{ display: 'grid', gap: 4 }} data-testid="fast-form">
      {fasting.error != null && !fasting.isLoading && fasting.fasts.length === 0 && (
        <LoadProblem what="Your fasts" error={fasting.error} onRetry={fasting.refetch} />
      )}

      {active ? (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <MetricRing
              value={(now - Date.parse(active.startedAt)) / HOUR_MS}
              target={fastHours}
              metric="fasting"
              trackColor={tokens.ink.fill}
              size={88}
              label="Fast"
              unit="h"
              centre={formatClockDuration(now - Date.parse(active.startedAt))}
              centreCaption={`of ${fastHours} h`}
            />
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ ...statValue('small'), lineHeight: 1.2 }}>
                {formatDuration(now - Date.parse(active.startedAt))}
              </Box>
              <Box sx={{ fontSize: tokens.font.size.small, color: 'text.secondary', mt: 1, lineHeight: tokens.font.leading.small }}>
                Started {formatDateTime(active.startedAt)}
                <br />
                {fastHours} h at {formatDateTime(Date.parse(active.startedAt) + fastHours * HOUR_MS)}
              </Box>
              {active.pending && (
                <Box sx={{ mt: 1 }}>
                  <PendingBadge />
                </Box>
              )}
            </Box>
          </Box>
          <Button variant="contained" size="large" onClick={() => endNow(active)} disabled={end.isPending} data-testid="fast-end">
            {end.isPending ? 'Saving…' : 'End fast'}
          </Button>
          {active.planned && (
            <Button variant="text" onClick={() => didNotFast(active)} disabled={cancel.isPending} data-testid="fast-skip">
              Didn't fast
            </Button>
          )}
        </>
      ) : (
        <>
          <Box sx={{ fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: 'text.secondary' }}>
            No fast running. A fast day is a known pattern: intake expected 0, water target up, training light.
          </Box>
          {soon ? (
            <Button variant="contained" size="large" onClick={() => startNow(soon)} disabled={start.isPending} data-testid="fast-start-planned">
              Start planned fast ({relativeDay(dateOf(soon.startedAt), today)} {clockOf(soon.startedAt)})
            </Button>
          ) : null}
          <Button
            variant={soon ? 'outlined' : 'contained'}
            size="large"
            onClick={() => startNow()}
            disabled={start.isPending}
            data-testid="fast-start"
          >
            {start.isPending ? 'Saving…' : 'Start fast now'}
          </Button>
        </>
      )}

      {missed && (
        <MissedFast
          fast={missed}
          fastHours={fastHours}
          now={now}
          busy={end.isPending || cancel.isPending}
          onEndAt={(endedAt) => endAt(missed, endedAt)}
          onSkip={() => didNotFast(missed)}
        />
      )}

      {error != null && (
        <Box role="alert" sx={{ color: tokens.tone.danger.text, fontSize: tokens.font.size.small }}>
          {problemText(error)}
        </Box>
      )}

      <Box sx={{ borderTop: `1px solid ${tokens.ink.border}`, pt: 4 }}>
        {planOpen ? (
          <PlanFastForm
            initialDate={date > today ? date : shiftDate(today, 1)}
            fasts={fasting.fasts}
            fastHours={fastHours}
            fastsPerMonth={fastsPerMonth}
            onPlanned={(n) => {
              setPlanOpen(false)
              onLogged(n)
            }}
          />
        ) : (
          <Button variant="outlined" fullWidth onClick={() => setPlanOpen(true)} data-testid="fast-plan-open">
            Plan a fast
          </Button>
        )}
        {upcoming.length > 0 && (
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: 3, display: 'grid' }} aria-label="Planned fasts">
            {upcoming.slice(0, 4).map((f) => (
              <Box
                component="li"
                key={f.id}
                sx={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: tokens.font.size.small, minHeight: 36, '& + &': { borderTop: `1px solid ${tokens.ink.hairline}` } }}
              >
                <Box aria-hidden sx={{ width: 8, height: 8, flex: 'none', borderRadius: `${tokens.radius.pill}px`, border: `2px solid ${tokens.metric.fasting}` }} />
                <Box sx={{ flex: 1, ...tabularNums }}>Planned {formatDateTime(f.startedAt)}</Box>
                {f.pending && <PendingBadge />}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}

/**
 * A fast never ended (a planned one that started on its own, or one Aaron started and forgot): record its real end
 * ("End at…", default the planned end or now if sooner) so the review reports its real duration, or, for a planned one,
 * remove it ("Didn't fast") so it is no fast day and no longer counts toward the month's fasts.
 */
function MissedFast({
  fast,
  fastHours,
  now,
  busy,
  onEndAt,
  onSkip,
}: {
  fast: FastView
  fastHours: number
  now: number
  busy: boolean
  onEndAt: (endedAt: string) => void
  onSkip: () => void
}) {
  const start = Date.parse(fast.startedAt)
  const fallback = Math.min(start + fastHours * HOUR_MS, now)
  const [value, setValue] = useState(`${dateOf(fallback)}T${clockOf(fallback)}`)
  const endedAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? instantAt(value.slice(0, 10), value.slice(11, 16)) : null
  const valid = endedAt !== null && Date.parse(endedAt) > start && Date.parse(endedAt) <= now

  return (
    <Box sx={{ display: 'grid', gap: 3, borderTop: `1px solid ${tokens.ink.border}`, pt: 4 }} data-testid="fast-missed">
      <Box sx={{ fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: 'text.secondary' }}>
        The fast {fast.planned ? 'planned for' : 'started'} {formatDateTime(fast.startedAt)} was never ended. When did it end?
      </Box>
      <TextField
        label="Ended at"
        type="datetime-local"
        value={value}
        onChange={(e) => e.target.value && setValue(e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      {/* "Didn't fast" removes a planned fast that never began; a fast Aaron started himself did begin (409 otherwise). */}
      <Box sx={{ display: 'grid', gridTemplateColumns: fast.planned ? '1fr 1fr' : '1fr', gap: 2 }}>
        <Button variant="contained" onClick={() => endedAt && onEndAt(endedAt)} disabled={!valid || busy} data-testid="fast-end-at">
          End at this time
        </Button>
        {fast.planned && (
          <Button variant="outlined" onClick={onSkip} disabled={busy} data-testid="fast-skip-missed">
            Didn't fast
          </Button>
        )}
      </Box>
    </Box>
  )
}

/** 18 h 5 min → "18:05". */
function formatClockDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000))
  return `${Math.floor(totalMin / 60)}:${String(totalMin % 60).padStart(2, '0')}`
}

function PlanFastForm({
  initialDate,
  fasts,
  fastHours,
  fastsPerMonth,
  onPlanned,
}: {
  initialDate: string
  fasts: readonly FastView[]
  fastHours: number
  fastsPerMonth: number
  onPlanned: (notice: LogNotice) => void
}) {
  const [date, setDate] = useState(initialDate)
  const [time, setTime] = useState(DEFAULT_PLAN_TIME)
  const plan = useLogMutation(endpoints.fasting.plan)
  const today = todayLocal()
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time) && date >= today
  // The month a fast counts in is its fast day's (the date holding most of it), as the Worker's cap counts it: a fast
  // from 31 Oct 19:00 is one of November's.
  const day = (valid && fastDay({ started_at: instantAt(date, time), ended_at: null }, fastHours)) || date
  const count = fastsInMonth(fasts, day, fastHours)
  const monthName = new Intl.DateTimeFormat('en-CA', { month: 'long', timeZone: 'UTC' }).format(Date.parse(`${day}T12:00:00Z`))

  return (
    <Box
      component="form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        plan.mutate(
          { body: { id: crypto.randomUUID(), started_at: instantAt(date, time) } },
          { onSuccess: (o) => onPlanned(noticeFor(o, `Fast planned for ${date} ${time}`)) },
        )
      }}
      sx={{ display: 'grid', gap: 3 }}
      data-testid="fast-plan-form"
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <TextField
          label="Date"
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today } }}
        />
        <TextField label="Start" type="time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
      </Box>
      <Box sx={{ fontSize: tokens.font.size.small, color: 'text.secondary' }} data-testid="fast-plan-count">
        {day !== date && `Fast day ${day}. `}
        {monthName}: {formatNumber(count)} of {formatNumber(fastsPerMonth)} planned
        {count >= fastsPerMonth ? ". That's the month's fasts already on the calendar." : '.'}
      </Box>
      {plan.isError && (
        <Box role="alert" sx={{ color: tokens.tone.danger.text, fontSize: tokens.font.size.small }}>
          {problemText(plan.error)}
        </Box>
      )}
      <Button type="submit" variant="contained" disabled={!valid || plan.isPending}>
        {plan.isPending ? 'Saving…' : `Plan fast · ${date} ${time}`}
      </Button>
    </Box>
  )
}
