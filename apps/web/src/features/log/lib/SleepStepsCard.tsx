// Owns: the Apple Watch manual route (SPEC §8 route 1) — steps for the day and last night's sleep (the night that
// ended on this date), as in-bed and wake times or as hours asleep, prefilled from what is logged. Thirty seconds.
// POST /api/steps and POST /api/sleep both upsert by date.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { endpoints } from '@fitness/shared/api'
import type { DayView } from '@fitness/shared/schemas'
import { useEffect, useState } from 'react'
import { formatNumber, PendingBadge } from '../../../components'
import { tokens } from '../../../theme'
import { clockOf, instantAt, NumberField, parseNumber, problemText, shiftDate, useLogMutation, usePendingLogs } from '../../quick-log'
import { LogCard } from './LogCard'

type SleepMode = 'times' | 'hours'

export function SleepStepsCard({ date, day }: { date: string; day: DayView | undefined }) {
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

  // Prefill from the day when it loads or the date changes.
  const serverSteps = day?.date === date ? day.steps : null
  const serverSleep = day?.date === date ? day.sleep : null
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
  const stepsChanged = stepsN !== null && stepsN !== serverSteps
  const canSave = stepsValid && (stepsChanged || sleepGiven) && !steps.isPending && !sleep.isPending

  const save = () => {
    const done: string[] = []
    const after = (label: string) => (outcome: { status: 'saved' | 'queued' }) => {
      done.push(outcome.status === 'queued' ? `${label} (on this phone)` : label)
      setSaved(`Saved ${done.join(' and ')}.`)
    }
    if (stepsChanged && stepsN !== null) {
      steps.mutate({ body: { id: crypto.randomUUID(), date, steps: stepsN } }, { onSuccess: after('steps') })
    }
    if (sleepGiven) {
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

  return (
    <LogCard
      title="Sleep and steps"
      color={tokens.metric.sleep}
      subtitle={`Last night (woke ${date}) and the day's steps`}
      badge={pendingSteps.length + pendingSleep.length > 0 ? <PendingBadge /> : undefined}
      testId="log-sleep-steps"
    >
      <Box
        component="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (canSave) save()
        }}
        sx={{ display: 'grid', gap: 3 }}
      >
        <NumberField label="Steps" value={stepsText} onChange={setStepsText} unit="steps" integer error={!stepsValid} />
        <ToggleButtonGroup
          value={mode}
          exclusive
          fullWidth
          size="small"
          onChange={(_, v: SleepMode | null) => v && setMode(v)}
          aria-label="Sleep entry"
          sx={{ '& .MuiToggleButton-root': { minHeight: tokens.tapTarget, textTransform: 'none', fontWeight: tokens.font.weight.label } }}
        >
          <ToggleButton value="times">In bed and wake times</ToggleButton>
          <ToggleButton value="hours">Hours asleep</ToggleButton>
        </ToggleButtonGroup>
        {mode === 'times' ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField label="In bed" type="time" value={bed} onChange={(e) => setBed(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField label="Woke" type="time" value={wake} onChange={(e) => setWake(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          </Box>
        ) : (
          <NumberField label="Hours asleep" value={hours} onChange={setHours} unit="h" error={hours !== '' && !hoursValid} />
        )}
        <Box sx={{ fontSize: 13, color: 'text.secondary', minHeight: 20 }} aria-live="polite">
          {error ? (
            <Box component="span" sx={{ color: 'error.main' }}>
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
    </LogCard>
  )
}

/** Minutes from "22:45" to "06:30", wrapping past midnight. */
function minutesBetween(from: string, to: string): number {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  return (m(to) - m(from) + 24 * 60) % (24 * 60)
}
