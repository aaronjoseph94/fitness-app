// Owns: the Apple Watch manual route (SPEC §8 route 1) on the Log tab — last night's sleep (the night that ended on
// this date) and the day's steps as two tiles with where they came from, and "Enter by hand" opening the form: steps,
// and sleep as in-bed and wake times or as hours asleep, prefilled from what is logged. Thirty seconds. POST /api/steps
// and POST /api/sleep both upsert by date. Links to the file import (route 2) for many days at once.
import WatchOutlined from '@mui/icons-material/WatchOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import Link from '@mui/material/Link'
import Skeleton from '@mui/material/Skeleton'
import TextField from '@mui/material/TextField'
import { endpoints } from '@fitness/shared/api'
import type { DayView, HealthSource } from '@fitness/shared/schemas'
import { useEffect, useId, useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { formatClock, formatNumber, NumberField, parseNumber, PendingBadge, Segmented, StatusChip, statValue, wellSurface } from '../../../components'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'
import { clockOf, instantAt, shiftDate, useLogMutation, usePendingLogs } from '../../quick-log'
import { LogCard } from './LogCard'
import { problemText } from '../../../api'

type SleepMode = 'times' | 'hours'

/** `loading`: the day is still being read (its tiles hold placeholders; once it fails they read "—" with no caption). */
export function SleepStepsCard({ date, day, loading }: { date: string; day: DayView | undefined; loading: boolean }) {
  const steps = useLogMutation(endpoints.health.createSteps)
  const sleep = useLogMutation(endpoints.health.createSleep)
  const pendingSteps = usePendingLogs(endpoints.health.createSteps).filter((p) => p.body.date === date)
  const pendingSleep = usePendingLogs(endpoints.health.createSleep).filter((p) => p.body.date === date)

  const [stepsText, setStepsText] = useState('')
  const [mode, setMode] = useState<SleepMode>('times')
  const [bed, setBed] = useState('')
  const [wake, setWake] = useState('')
  const [hours, setHours] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const formId = useId()

  // Prefill from the day when it loads or the date changes.
  const known = day?.date === date
  const serverSteps = known ? day.steps : null
  const serverSleep = known ? day.sleep : null
  useEffect(() => {
    setStepsText(serverSteps !== null ? String(serverSteps) : '')
    if (serverSleep?.in_bed_at && serverSleep.woke_at) {
      setMode('times')
      setBed(clockOf(serverSleep.in_bed_at))
      setWake(clockOf(serverSleep.woke_at))
    } else {
      setBed('')
      setWake('')
      if (serverSleep) setMode('hours')
    }
    setHours(serverSleep ? String(Math.round((serverSleep.asleep_min / 60) * 10) / 10) : '')
  }, [date, serverSteps, serverSleep])
  useEffect(() => setSaved(null), [date])

  const stepsN = parseNumber(stepsText)
  const stepsValid = stepsN === null || (Number.isInteger(stepsN) && stepsN >= 0 && stepsN <= 200_000)
  const hoursN = parseNumber(hours)
  const timesGiven = /^\d{2}:\d{2}$/.test(bed) && /^\d{2}:\d{2}$/.test(wake)
  const hoursValid = hoursN !== null && hoursN > 0 && hoursN <= 24
  const sleepGiven = mode === 'times' ? timesGiven : hoursValid
  // Only a night Aaron changed is sent: re-saving the prefilled one would replace the watch's own asleep minutes and
  // stages with time in bed (a manual entry), just because the day's steps were saved.
  const serverTimes = serverSleep?.in_bed_at && serverSleep.woke_at ? { bed: clockOf(serverSleep.in_bed_at), wake: clockOf(serverSleep.woke_at) } : null
  const serverHours = serverSleep ? Math.round((serverSleep.asleep_min / 60) * 10) / 10 : null
  const sleepChanged =
    sleepGiven && (mode === 'times' ? !serverTimes || serverTimes.bed !== bed || serverTimes.wake !== wake : hoursN !== serverHours)
  const stepsChanged = stepsN !== null && stepsN !== serverSteps
  const canSave = stepsValid && (stepsChanged || sleepChanged) && !steps.isPending && !sleep.isPending

  const save = () => {
    const done: string[] = []
    const after = (label: string) => (outcome: { status: 'saved' | 'queued' }) => {
      done.push(outcome.status === 'queued' ? `${label} (on this phone)` : label)
      setSaved(`Saved ${done.join(' and ')}.`)
    }
    if (stepsChanged && stepsN !== null) {
      steps.mutate({ body: { id: crypto.randomUUID(), date, steps: stepsN } }, { onSuccess: after('steps') })
    }
    if (sleepChanged) {
      if (mode === 'times') {
        // In bed after the wake time on the clock means the evening before (22:45 → 06:30).
        const bedDate = bed > wake ? shiftDate(date, -1) : date
        sleep.mutate({ body: { id: crypto.randomUUID(), date, in_bed_at: instantAt(bedDate, bed), woke_at: instantAt(date, wake) } }, { onSuccess: after('sleep') })
      } else if (hoursN !== null) {
        sleep.mutate({ body: { id: crypto.randomUUID(), date, asleep_min: Math.round(hoursN * 60) } }, { onSuccess: after('sleep') })
      }
    }
  }

  const asleepFromTimes = timesGiven ? minutesBetween(bed, wake) : null
  const error = steps.error ?? sleep.error
  const stepsTarget = day?.date === date ? (day.targets?.steps ?? null) : null

  return (
    <LogCard
      title="Sleep and steps"
      icon={WatchOutlined}
      iconColor={tokens.metric.sleep}
      meta={
        <>
          {pendingSteps.length + pendingSleep.length > 0 && <PendingBadge />}
          {serverSleep && <StatusChip tone="outline" size="small" label={`${SOURCE_LABEL[serverSleep.source]} · ${formatClock(serverSleep.updated_at)}`} />}
        </>
      }
      testId="log-sleep-steps"
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 3 }}>
        {/* Until the day is known nothing is claimed: a placeholder while it loads, "—" if it failed. */}
        <Tile
          label="Last night"
          value={serverSleep ? formatNumber(serverSleep.asleep_min / 60, 1) : !known && loading ? null : '—'}
          unit={serverSleep ? 'h' : undefined}
          caption={
            serverSleep?.in_bed_at && serverSleep.woke_at
              ? `${formatClock(serverSleep.in_bed_at)} – ${formatClock(serverSleep.woke_at)}`
              : serverSleep
                ? 'asleep'
                : known
                  ? 'Not logged'
                  : undefined
          }
        />
        <Tile
          label="Steps"
          value={serverSteps !== null ? formatNumber(serverSteps) : !known && loading ? null : '—'}
          caption={stepsTarget !== null ? `of ${formatNumber(stepsTarget)}` : known && serverSteps === null ? 'Not logged' : undefined}
        />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 12px', mt: '10px' }}>
        <Button variant="outlined" size="tiny" aria-expanded={open} aria-controls={formId} onClick={() => setOpen((o) => !o)}>
          Enter by hand
        </Button>
        <Link
          component={RouterLink}
          to="/imports/health"
          data-testid="log-health-import"
          sx={{
            // A 24 px target (WCAG 2.5.8), 44 on touch, centred in the button's row, so the row keeps its height.
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: tokens.space(6),
            [COARSE_POINTER_QUERY]: { minHeight: tokens.tapTarget },
            fontSize: tokens.font.size.caption,
            fontWeight: tokens.font.weight.label,
          }}
        >
          Import an Apple Watch export
        </Link>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box
          component="form"
          id={formId}
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            if (canSave) save()
          }}
          sx={{ display: 'grid', gap: 3, pt: 4 }}
        >
          <NumberField label="Steps" value={stepsText} onChange={setStepsText} unit="steps" integer error={!stepsValid} />
          <Segmented
            ariaLabel="Sleep entry"
            value={mode}
            onChange={setMode}
            fullWidth
            size="small"
            options={[
              { value: 'times', label: 'In bed and wake times' },
              { value: 'hours', label: 'Hours asleep' },
            ]}
          />
          {mode === 'times' ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField label="In bed" type="time" value={bed} onChange={(e) => setBed(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField label="Woke" type="time" value={wake} onChange={(e) => setWake(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            </Box>
          ) : (
            <NumberField label="Hours asleep" value={hours} onChange={setHours} unit="h" error={hours !== '' && !hoursValid} />
          )}
          <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary, minHeight: 18 }} aria-live="polite">
            {error ? (
              <Box component="span" sx={{ color: tokens.tone.danger.text }}>
                {problemText(error)}
              </Box>
            ) : saved ? (
              saved
            ) : mode === 'times' && asleepFromTimes !== null ? (
              `${formatNumber(asleepFromTimes / 60, 1)} h in bed`
            ) : serverSleep ? (
              `Logged ${formatNumber(serverSleep.asleep_min / 60, 1)} h asleep`
            ) : (
              'Either way works; times also feed the bedtime chart.'
            )}
          </Box>
          <Button type="submit" variant="contained" disabled={!canSave}>
            {steps.isPending || sleep.isPending ? 'Saving…' : 'Save'}
          </Button>
        </Box>
      </Collapse>
    </LogCard>
  )
}

const SOURCE_LABEL: Record<HealthSource, string> = { watch_webhook: 'Apple Watch', import: 'Imported', manual: 'By hand' }

/**
 * One of the two panel-tint tiles: 12 px label, 22/600 value with its unit (2a draws 20; the type scale's nearest step),
 * 11 px caption. `value` null: a placeholder in the value's line while the day loads.
 */
function Tile({ label, value, unit, caption }: { label: string; value: string | null; unit?: string; caption?: string }) {
  return (
    <Box sx={{ ...wellSurface, px: 3, py: '10px', minWidth: 0 }}>
      <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary }}>{label}</Box>
      <Box sx={{ mt: '2px', ...statValue('small'), lineHeight: 1.3 }}>
        {value ?? <Skeleton variant="text" width={64} sx={{ display: 'inline-block' }} />}
        {unit && (
          <Box component="span" sx={{ fontSize: tokens.font.size.caption, fontWeight: tokens.font.weight.body, color: tokens.ink.secondary, letterSpacing: 0 }}>
            {' '}
            {unit}
          </Box>
        )}
      </Box>
      {/* The caption's line is kept when there is none, so the tile doesn't change height once the day loads. */}
      <Box sx={{ minHeight: '1.5em', fontSize: tokens.font.size.micro, color: tokens.ink.secondary, fontVariantNumeric: 'tabular-nums' }}>{caption}</Box>
    </Box>
  )
}

/** Minutes from "22:45" to "06:30", wrapping past midnight. */
function minutesBetween(from: string, to: string): number {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  return (m(to) - m(from) + 24 * 60) % (24 * 60)
}
