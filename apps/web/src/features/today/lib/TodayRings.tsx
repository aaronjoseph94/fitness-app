// Owns: Today's rings card — calories left of the day's target, protein, water, steps and last night's sleep, with the
// fast badge (fasting now, or a fast day), queued logs added in and marked pending, and the manual steps/sleep entry.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import type { DayView } from '@fitness/shared/schemas'
import { useEffect, useState } from 'react'
import { formatNumber, PendingBadge, RingsRow, type RingItem } from '../../../components'
import { tokens } from '../../../theme'
import type { PendingToday } from './pending'

/** SPEC §9 readiness compares sleep with 7.5 h. */
export const SLEEP_TARGET_H = 7.5

function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

/** The five rings for a day, with queued logs added in. Pure. */
export function ringsFor(day: DayView, pending: PendingToday, waterTargetMl: number): RingItem[] {
  const t = day.targets
  const fastDay = day.fast.is_fast_day || t?.is_fast_day === true
  const eaten = Math.round(day.intake.total.kcal)
  const kcalTarget = t?.kcal ?? 0
  const left = kcalTarget - eaten

  const calories: RingItem =
    kcalTarget > 0
      ? {
          id: 'calories',
          label: 'Calories',
          metric: 'calories',
          value: eaten,
          target: kcalTarget,
          centre: formatNumber(Math.abs(left)),
          centreCaption: left >= 0 ? 'left' : 'over',
          detail: `of ${formatNumber(kcalTarget)} kcal`,
          unit: 'kcal',
        }
      : {
          id: 'calories',
          label: 'Calories',
          metric: 'calories',
          value: eaten,
          target: Math.max(eaten, 1),
          centre: fastDay ? 'Fast' : formatNumber(eaten),
          centreCaption: fastDay ? undefined : 'kcal',
          detail: fastDay ? 'fast day' : 'no target yet',
          unit: 'kcal',
        }

  const protein = Math.round(day.intake.total.protein_g)
  const proteinTarget = t?.protein_g ?? 0
  const waterMl = day.water_ml + pending.waterMl
  const waterTarget = t?.water_ml ?? waterTargetMl
  const steps = day.steps ?? pending.steps
  const stepsTarget = t?.steps ?? 0
  const sleepMin = day.sleep?.asleep_min ?? pending.sleepMin
  const sleepH = sleepMin === null ? null : sleepMin / 60

  return [
    calories,
    {
      id: 'protein',
      label: 'Protein',
      metric: 'protein',
      value: protein,
      target: proteinTarget,
      centreCaption: 'g',
      detail: proteinTarget ? `of ${formatNumber(proteinTarget)} g` : fastDay ? 'fast day' : 'no target yet',
      unit: 'g',
    },
    {
      id: 'water',
      label: 'Water',
      metric: 'water',
      value: waterMl,
      target: waterTarget,
      centre: formatNumber(waterMl / 1000, 1),
      centreCaption: 'L',
      detail: `of ${formatNumber(waterTarget)} ml`,
      unit: 'ml',
    },
    {
      id: 'steps',
      label: 'Steps',
      metric: 'steps',
      value: steps ?? 0,
      target: stepsTarget,
      // Four characters fit the 58 px ring: 6,240 → "6.2K".
      centre: steps === null ? '—' : steps >= 1000 ? formatNumber(steps, 1, true) : formatNumber(steps),
      detail: steps === null ? 'not logged' : stepsTarget ? `of ${formatNumber(stepsTarget)}` : 'steps',
      unit: 'steps',
    },
    {
      id: 'sleep',
      label: 'Sleep',
      metric: 'sleep',
      value: sleepH ?? 0,
      target: SLEEP_TARGET_H,
      centre: sleepH === null ? '—' : formatNumber(sleepH, 1),
      centreCaption: sleepH === null ? undefined : 'h',
      detail: sleepH === null ? 'not logged' : `of ${SLEEP_TARGET_H} h`,
      unit: 'h',
    },
  ]
}

function FastBadge({ day, pending, now }: { day: DayView; pending: PendingToday; now: number }) {
  const active = pending.fast === 'started' || (pending.fast !== 'ended' && day.fast.state === 'active')
  const startedAt = day.fast.state === 'active' ? day.fast.fast?.started_at : undefined
  let label: string | null = null
  if (active) {
    const hours = startedAt ? Math.max(0, (now - Date.parse(startedAt)) / 3_600_000) : null
    label = hours === null ? 'Fasting' : `Fasting · ${formatNumber(hours, hours < 10 ? 1 : 0)} h`
  } else if (day.fast.is_fast_day || day.targets?.is_fast_day) label = 'Fast day'
  if (!label) return null
  return (
    <Chip
      data-testid="fast-badge"
      size="small"
      label={label}
      sx={{ bgcolor: tokens.metric.fasting, color: tokens.ink.card, fontVariantNumeric: 'tabular-nums' }}
    />
  )
}

interface TodayRingsProps {
  day: DayView | undefined
  loading: boolean
  pending: PendingToday
  waterTargetMl: number
  onAddHealth: () => void
}

export function TodayRings({ day, loading, pending, waterTargetMl, onAddHealth }: TodayRingsProps) {
  const now = useMinuteClock()
  if (loading || !day)
    return (
      <Card sx={{ p: 4 }} aria-busy="true">
        <Skeleton variant="text" width={120} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="circular" width={58} height={58} />
          ))}
        </Box>
      </Card>
    )

  const missingHealth = (day.steps ?? pending.steps) === null || (day.sleep?.asleep_min ?? pending.sleepMin) === null
  return (
    <Card data-testid="today-rings" sx={{ p: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4, minHeight: 24 }}>
        <Box sx={{ flex: 1, fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: tokens.ink.secondary }}>
          Today · {day.date}
        </Box>
        <FastBadge day={day} pending={pending} now={now} />
        {pending.count > 0 && <PendingBadge count={pending.count} />}
      </Box>
      <RingsRow rings={ringsFor(day, pending, waterTargetMl)} />
      {(pending.meals > 0 || missingHealth) && (
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mt: 3 }}>
          {pending.meals > 0 && (
            <Box sx={{ flex: 1, fontSize: tokens.font.size.label, color: tokens.ink.secondary }}>
              {pending.meals === 1 ? 'One meal' : `${pending.meals} meals`} will count once synced.
            </Box>
          )}
          {missingHealth && (
            <Button size="small" onClick={onAddHealth} sx={{ ml: 'auto', minHeight: tokens.tapTarget }} data-testid="add-health">
              Add steps or sleep
            </Button>
          )}
        </Box>
      )}
    </Card>
  )
}
