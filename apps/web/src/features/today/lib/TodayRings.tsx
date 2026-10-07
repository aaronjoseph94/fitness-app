// Owns: Today's metric row — calories, protein, water, steps and last night's sleep as one metric card each (value, a
// fill bar against the target, and a line saying what the target is), with the fast badge (fasting now, or a fast
// day), queued logs added in and marked pending, and the manual steps/sleep entry; while the day loads, a placeholder
// for each card in the same grid and the same box, so nothing below moves when they arrive.
//
// The five cards are `surface="plain"` since the HIG rebuild: they are five facts of equal weight on the app's most
// frequently seen screen, so they are white cards with the metric colour as an accent (icon tile, target bar) and the
// page's one saturated gradient stays on the Dashboard hero, where a single number is genuinely the headline.
import BedtimeRounded from '@mui/icons-material/BedtimeRounded'
import DirectionsWalkRounded from '@mui/icons-material/DirectionsWalkRounded'
import EggAltRounded from '@mui/icons-material/EggAltRounded'
import LocalFireDepartmentRounded from '@mui/icons-material/LocalFireDepartmentRounded'
import WaterDropRounded from '@mui/icons-material/WaterDropRounded'
import type { SvgIconComponent } from '@mui/icons-material'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import type { DayView } from '@fitness/shared/schemas'
import { useEffect, useState } from 'react'
import { formatNumber, MetricCard, PendingBadge, type RingItem } from '../../../components'
import { tokens } from '../../../theme'
import type { PendingToday } from './pending'

/** SPEC §9 readiness compares sleep with 7.5 h. */
export const SLEEP_TARGET_H = 7.5

/** One icon per metric. The label always names the metric too, so the glyph is decoration, never the only signal. */
const ICONS: Record<string, SvgIconComponent> = {
  calories: LocalFireDepartmentRounded,
  protein: EggAltRounded,
  water: WaterDropRounded,
  steps: DirectionsWalkRounded,
  sleep: BedtimeRounded,
}

/** The card grid: two across on a phone, three from 600 px, all five in one row once there is room. */
const GRID = {
  display: 'grid',
  // A slightly tighter gap on a phone buys each half-width card the few pixels a four-digit number needs.
  gap: { xs: 2, sm: 3 },
  gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' },
} as const

function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

/** The five metrics for a day, with queued logs added in. Pure. */
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
      // Kept for the report and any ring still drawn from this list; the metric card shows the full number.
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

/**
 * What a metric card says under its number: the target, and — because the fill bar stops at 100 % — how far past it
 * the day went, spelled out. Called for every ring so the over case is never silently lost.
 */
function captionFor(ring: RingItem): string | undefined {
  const over = ring.target > 0 && ring.value > ring.target ? Math.round(ring.value - ring.target) : 0
  if (!over) return ring.detail
  return `${ring.detail ?? ''} · ${formatNumber(over)} ${ring.unit ?? ''} over`.trim()
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

/** The row while the day loads: one placeholder card per metric, in the same grid, so nothing below moves. */
function RingsSkeleton() {
  return (
    <Box aria-busy="true" data-testid="today-rings-loading">
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, minHeight: 24 }}>
        <Skeleton variant="text" width={120} />
      </Box>
      <Box sx={GRID}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rounded" height={172} sx={{ borderRadius: `${tokens.radius.card}px` }} />
        ))}
      </Box>
    </Box>
  )
}

export function TodayRings({ day, loading, pending, waterTargetMl, onAddHealth }: TodayRingsProps) {
  const now = useMinuteClock()
  if (loading || !day) return <RingsSkeleton />

  const missingHealth = (day.steps ?? pending.steps) === null || (day.sleep?.asleep_min ?? pending.sleepMin) === null
  const rings = ringsFor(day, pending, waterTargetMl)
  return (
    <Box data-testid="today-rings">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, minHeight: 24 }}>
        <Box
          sx={{
            flex: 1,
            fontSize: tokens.font.size.label,
            fontWeight: tokens.font.weight.label,
            color: tokens.ink.secondary,
            lineHeight: tokens.font.leading.label,
            letterSpacing: tokens.font.tracking.label,
          }}
        >
          Today · {day.date}
        </Box>
        <FastBadge day={day} pending={pending} now={now} />
        {pending.count > 0 && <PendingBadge count={pending.count} />}
      </Box>

      <Box sx={GRID}>
        {rings.map((ring, i) => {
          // `ringsFor` marks a metric the day has no reading for with an em dash in `centre`: steps and sleep are
          // "not logged", which is not the same claim as zero, so the card shows "—" and draws no bar at all.
          const notLogged = ring.centre === '—'
          return (
            <MetricCard
              key={ring.id}
              testId={`today-metric-${ring.id}`}
              label={ring.label}
              metric={ring.metric}
              surface="plain"
              icon={ICONS[ring.id]}
              value={notLogged ? null : ring.value}
              unit={ring.unit}
              precision={ring.id === 'sleep' ? 1 : 0}
              // A fast day has no calorie target by design, so its card shows no bar rather than a bar of zero. The
              // target is passed separately from the ratio so the card can name the amount and the target together.
              progress={!notLogged && ring.target > 0 ? ring.value / ring.target : null}
              target={!notLogged && ring.target > 0 ? ring.target : null}
              caption={captionFor(ring)}
              // A short stagger: the row assembles instead of appearing in one block, and the last card lands with it.
              delay={i * 40}
            />
          )
        })}
      </Box>

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
    </Box>
  )
}
