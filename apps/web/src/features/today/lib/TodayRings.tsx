// Owns: Today's five stat cards (2a) — calories, protein, water, steps and last night's sleep: the amount against its
// target ("860 / 1,400 kcal"), a 6 px bar in the metric colour, and a caption whose key figure is what is left (or
// when he slept); queued logs added in. Each card is a `group` named with the whole sentence in the units the day
// stores ("Water: 1,750 of 3,000 ml"), so the amount and its target are one announcement. Under the cards, only when
// there is something to say: the fast badge (fasting now, or a fast day), the pending count, meals that count once
// synced, and the manual steps/sleep entry. While the day loads, five placeholders of the card's height hold the grid.
import BedtimeRounded from '@mui/icons-material/BedtimeRounded'
import DirectionsWalkRounded from '@mui/icons-material/DirectionsWalkRounded'
import EggAltRounded from '@mui/icons-material/EggAltRounded'
import LocalFireDepartmentRounded from '@mui/icons-material/LocalFireDepartmentRounded'
import TimerRounded from '@mui/icons-material/TimerRounded'
import WaterDropRounded from '@mui/icons-material/WaterDropRounded'
import type { SvgIconComponent } from '@mui/icons-material'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import type { DayView } from '@fitness/shared/schemas'
import { useEffect, useState, type ReactNode } from 'react'
import { formatNumber, PendingBadge, Reveal, StatCard, StatusChip, staggerDelay } from '../../../components'
import { tokens, type MetricKey } from '../../../theme'
import { clockTime } from './event-view'
import type { PendingToday } from './pending'

/** SPEC §9 readiness compares sleep with 7.5 h. */
export const SLEEP_TARGET_H = 7.5

/** A 2a stat card's rendered height (label, value, bar, caption), so the placeholders hold the row. */
const CARD_HEIGHT = 138

/** The card grid: two across on a phone (sleep takes the last row), from 600 px three over two on six tracks, all five
 * in one row from `lg`: never an empty cell. */
const GRID = {
  display: 'grid',
  // A slightly tighter gap on a phone buys each half-width card the few pixels a four-digit number needs.
  gap: { xs: 2, sm: 4 },
  gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(6, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' },
} as const

/** Card `i`'s place in GRID: the fifth spans a phone's row; from `sm` the first three take two of the six tracks and
 * the last two take three. */
const cellSx = (i: number) => ({ minWidth: 0, gridColumn: { xs: i === 4 ? 'span 2' : 'auto', sm: `span ${i < 3 ? 2 : 3}`, lg: 'auto' } })

/** 2a's stagger: the row starts after the title and the cards follow 60 ms apart. */
const cardDelay = (i: number) => staggerDelay(i, tokens.motion.stagger.card, 100)

function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

interface Stat {
  id: 'calories' | 'protein' | 'water' | 'steps' | 'sleep'
  label: string
  metric: MetricKey
  icon: SvgIconComponent
  /** The amount as shown (litres for water); null when not logged. */
  shown: number | null
  precision: number
  /** "/ 1,400 kcal", or the bare unit without a target. */
  unit: string
  progress: number | null
  /** The card's accessible name, in the stored unit: "Water: 1,750 of 3,000 ml". */
  name: string
  footnote: ReactNode
}

/** "Water: 1,750 of 3,000 ml" with a target, "Steps: — steps" without one. */
function sentence(label: string, value: number | null, target: number, unit: string, precision = 0): string {
  const amount = formatNumber(value, precision)
  return value !== null && target > 0 ? `${label}: ${amount} of ${formatNumber(target, precision)} ${unit}` : `${label}: ${amount} ${unit}`
}

/** Litres for a card: "1.75", and "3.0" for a round amount. */
const litrePrecision = (ml: number) => (ml % 100 === 0 ? 1 : 2)
const litres = (ml: number) => formatNumber(ml / 1000, litrePrecision(ml))

const toGo = (left: number, unit: string) => (left > 0 ? <strong>{`${formatNumber(left)}${unit} to go`}</strong> : <strong>Target met</strong>)

/** The five cards for a day, with queued logs added in. Pure. */
export function statsFor(day: DayView, pending: PendingToday, waterTargetMl: number): Stat[] {
  const t = day.targets
  const fastDay = day.fast.is_fast_day || t?.is_fast_day === true
  const noTarget = fastDay ? 'Fast day' : 'No target yet'

  const eaten = Math.round(day.intake.total.kcal)
  const kcalTarget = t?.kcal ?? 0
  const left = kcalTarget - eaten
  const meals = day.intake.meals_logged
  const protein = Math.round(day.intake.total.protein_g)
  const proteinTarget = t?.protein_g ?? 0
  const waterMl = day.water_ml + pending.waterMl
  const waterTarget = t?.water_ml ?? waterTargetMl
  const steps = day.steps ?? pending.steps
  const stepsTarget = t?.steps ?? 0
  const sleepMin = day.sleep?.asleep_min ?? pending.sleepMin
  const sleepH = sleepMin === null ? null : sleepMin / 60
  const bed = day.sleep?.asleep_min != null && day.sleep.in_bed_at && day.sleep.woke_at ? day.sleep : null
  const ratio = (value: number | null, target: number) => (value !== null && target > 0 ? value / target : null)

  return [
    {
      id: 'calories',
      label: 'Calories',
      metric: 'calories',
      icon: LocalFireDepartmentRounded,
      shown: eaten,
      precision: 0,
      unit: kcalTarget > 0 ? `/ ${formatNumber(kcalTarget)} kcal` : 'kcal',
      progress: ratio(eaten, kcalTarget),
      name: sentence('Calories', eaten, kcalTarget, 'kcal'),
      footnote:
        kcalTarget > 0 ? (
          <>
            <strong>{left >= 0 ? `${formatNumber(left)} left` : `${formatNumber(-left)} over`}</strong> · {meals} {meals === 1 ? 'meal' : 'meals'} logged
          </>
        ) : (
          noTarget
        ),
    },
    {
      id: 'protein',
      label: 'Protein',
      metric: 'protein',
      icon: EggAltRounded,
      shown: protein,
      precision: 0,
      unit: proteinTarget > 0 ? `/ ${formatNumber(proteinTarget)} g` : 'g',
      progress: ratio(protein, proteinTarget),
      name: sentence('Protein', protein, proteinTarget, 'g'),
      footnote: proteinTarget > 0 ? toGo(proteinTarget - protein, ' g') : noTarget,
    },
    {
      id: 'water',
      label: 'Water',
      metric: 'water',
      icon: WaterDropRounded,
      shown: waterMl / 1000,
      precision: litrePrecision(waterMl),
      unit: `/ ${litres(waterTarget)} L`,
      progress: ratio(waterMl, waterTarget),
      name: sentence('Water', waterMl, waterTarget, 'ml'),
      footnote: waterTarget - waterMl > 0 ? <strong>{`${litres(waterTarget - waterMl)} L to go`}</strong> : <strong>Target met</strong>,
    },
    {
      id: 'steps',
      label: 'Steps',
      metric: 'steps',
      icon: DirectionsWalkRounded,
      shown: steps,
      precision: 0,
      unit: steps !== null && stepsTarget > 0 ? `/ ${formatNumber(stepsTarget)}` : 'steps',
      progress: ratio(steps, stepsTarget),
      name: sentence('Steps', steps, stepsTarget, 'steps'),
      footnote: steps === null ? 'Not logged' : stepsTarget > 0 ? toGo(stepsTarget - steps, '') : null,
    },
    {
      id: 'sleep',
      label: 'Sleep',
      metric: 'sleep',
      icon: BedtimeRounded,
      shown: sleepH,
      precision: 1,
      unit: `/ ${formatNumber(SLEEP_TARGET_H, 1)} h`,
      progress: ratio(sleepH, SLEEP_TARGET_H),
      name: sentence('Sleep', sleepH, SLEEP_TARGET_H, 'h', 1),
      footnote:
        sleepH === null ? 'Not logged' : bed ? <strong>{`${clockTime(bed.in_bed_at!)} – ${clockTime(bed.woke_at!)}`}</strong> : 'Last night',
    },
  ]
}

/** "Fasting · 3.2 h" while a fast runs, "Fast day" on a planned one, else null. */
function fastLabel(day: DayView, pending: PendingToday, now: number): string | null {
  const active = pending.fast === 'started' || (pending.fast !== 'ended' && day.fast.state === 'active')
  if (active) {
    const startedAt = day.fast.state === 'active' ? day.fast.fast?.started_at : undefined
    const hours = startedAt ? Math.max(0, (now - Date.parse(startedAt)) / 3_600_000) : null
    return hours === null ? 'Fasting' : `Fasting · ${formatNumber(hours, hours < 10 ? 1 : 0)} h`
  }
  return day.fast.is_fast_day || day.targets?.is_fast_day ? 'Fast day' : null
}

interface TodayRingsProps {
  day: DayView | undefined
  loading: boolean
  pending: PendingToday
  waterTargetMl: number
  onAddHealth: () => void
}

/** The row while the day loads: one placeholder per card, in the same grid, so nothing below moves. */
function RingsSkeleton() {
  return (
    <Box aria-busy="true" data-testid="today-rings-loading" sx={GRID}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} variant="rounded" height={CARD_HEIGHT} sx={cellSx(i)} />
      ))}
    </Box>
  )
}

export function TodayRings({ day, loading, pending, waterTargetMl, onAddHealth }: TodayRingsProps) {
  const now = useMinuteClock()
  if (loading || !day) return <RingsSkeleton />

  const missingHealth = (day.steps ?? pending.steps) === null || (day.sleep?.asleep_min ?? pending.sleepMin) === null
  const fast = fastLabel(day, pending, now)
  return (
    <Box data-testid="today-rings">
      <Box sx={GRID}>
        {statsFor(day, pending, waterTargetMl).map((s, i) => (
          <Reveal key={s.id} delay={cardDelay(i)} sx={cellSx(i)}>
            {/* `group`, not `img`: the card has readable content inside it (the number, the caption, the bar). */}
            <Box role="group" aria-label={s.name} data-testid={`today-metric-${s.id}`} sx={{ height: '100%', minWidth: 0 }}>
              <StatCard
                label={s.label}
                icon={s.icon}
                metric={s.metric}
                value={s.shown}
                precision={s.precision}
                unit={s.unit}
                progress={s.progress}
                footnote={s.footnote}
                countUp
                delay={cardDelay(i) + 200}
              />
            </Box>
          </Reveal>
        ))}
      </Box>

      {(fast || pending.count > 0 || pending.meals > 0 || missingHealth) && (
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mt: 3 }}>
          {fast && <StatusChip testId="fast-badge" tone="warning" icon={TimerRounded} label={fast} />}
          {pending.count > 0 && <PendingBadge count={pending.count} />}
          {pending.meals > 0 && (
            <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.muted }}>
              {pending.meals === 1 ? 'One meal' : `${pending.meals} meals`} will count once synced.
            </Box>
          )}
          {missingHealth && (
            <Button variant="outlined" size="small" onClick={onAddHealth} sx={{ ml: 'auto' }} data-testid="add-health">
              Add steps or sleep
            </Button>
          )}
        </Box>
      )}
    </Box>
  )
}
