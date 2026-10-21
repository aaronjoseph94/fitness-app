// Owns: Today's "Today's fuel" card (1d README §5.1) — "As of" the day's last read, then five capsule gauges in one row
// at every width (kcal left, protein, water, steps, last night's sleep): each fills with its metric ramp to the share of
// its target (the kcal capsule fills with what is eaten), shows its figure (counting up) over "of <target>", and is a
// `group` named with the whole reading in the units the day stores ("Water: 1,750 of 3,000 ml"; calories as eaten, with
// what is left after it), so the e2e helpers and assistive tech read one sentence; queued logs are added in. Under the
// gauges, only when there is something to say: the fast badge (fasting now, or a fast day), the pending count, meals
// that count once synced, and the manual steps/sleep entry. While the day loads the card holds its shape.
import TimerRounded from '@mui/icons-material/TimerRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import type { DayView } from '@fitness/shared/schemas'
import { useEffect, useId, useState, type ReactNode } from 'react'
import {
  CapsuleGauge,
  CapsuleGaugeRow,
  cardSurface,
  CountUp,
  displayTitle,
  formatClock,
  formatNumber,
  PendingBadge,
  sizeContainer,
  StatusChip,
  staggerDelay,
} from '../../../components'
import { tokens, type MetricKey } from '../../../theme'
import type { PendingToday } from './pending'

/** SPEC §9 readiness compares sleep with 7.5 h. */
export const SLEEP_TARGET_H = 7.5

/** The mock's capsule height on a phone and a desktop card, for the placeholder (clamp(80px, 26cqi, 170px) + text). */
const GAUGES_HEIGHT = 'clamp(150px, calc(26cqi + 74px), 250px)'

/** The gauges grow 100 ms apart after the card rises (README §6). */
const gaugeDelay = (i: number) => staggerDelay(i, 100, 500)

function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

interface Gauge {
  id: 'calories' | 'protein' | 'water' | 'steps' | 'sleep'
  metric: MetricKey
  /** What the figure reads ("kcal left", "protein"). */
  label: string
  /** The figure; null when not logged. */
  shown: number | null
  precision: number
  /** Beside the figure at .62em ("g", "L", "h"). */
  unit?: string
  /** The fill, 0–1+; null for none. */
  ratio: number | null
  /** "of 1,400", or why there is no target. */
  caption: ReactNode
  /** The gauge's accessible name, in the stored unit: "Water: 1,750 of 3,000 ml". */
  name: string
}

/** "Water: 1,750 of 3,000 ml" with a target, "Steps: — steps" without one. */
function sentence(label: string, value: number | null, target: number, unit: string, precision = 0): string {
  const amount = formatNumber(value, precision)
  return value !== null && target > 0
    ? `${label}: ${amount} of ${formatNumber(target, precision)} ${unit}`
    : `${label}: ${amount} ${unit}`
}

/** Litres for a gauge: "1.75", and "3.0" for a round amount. */
const litrePrecision = (ml: number) => (ml % 100 === 0 ? 1 : 2)
const litres = (ml: number) => formatNumber(ml / 1000, ml % 1000 === 0 ? 0 : litrePrecision(ml))

const ratioOf = (value: number | null, target: number) =>
  value !== null && target > 0 ? value / target : null

/** The five gauges for a day, with queued logs added in. Pure. */
export function gaugesFor(day: DayView, pending: PendingToday, waterTargetMl: number): Gauge[] {
  const t = day.targets
  const fastDay = day.fast.is_fast_day || t?.is_fast_day === true
  const noTarget = fastDay ? 'Fast day' : 'No target yet'

  const eaten = Math.round(day.intake.total.kcal)
  const kcalTarget = t?.kcal ?? 0
  const left = kcalTarget - eaten
  const protein = Math.round(day.intake.total.protein_g)
  const proteinTarget = t?.protein_g ?? 0
  const waterMl = day.water_ml + pending.waterMl
  const waterTarget = t?.water_ml ?? waterTargetMl
  const steps = day.steps ?? pending.steps
  const stepsTarget = t?.steps ?? 0
  const sleepMin = day.sleep?.asleep_min ?? pending.sleepMin
  const sleepH = sleepMin === null ? null : sleepMin / 60
  const calories = sentence('Calories', eaten, kcalTarget, 'kcal')

  return [
    kcalTarget > 0
      ? {
          id: 'calories',
          metric: 'calories',
          label: left >= 0 ? 'kcal left' : 'kcal over',
          shown: Math.abs(left),
          precision: 0,
          ratio: eaten / kcalTarget,
          caption: `of ${formatNumber(kcalTarget)}`,
          name: `${calories}, ${formatNumber(Math.abs(left))} ${left >= 0 ? 'left' : 'over'}`,
        }
      : {
          id: 'calories',
          metric: 'calories',
          label: 'kcal eaten',
          shown: eaten,
          precision: 0,
          ratio: null,
          caption: noTarget,
          name: calories,
        },
    {
      id: 'protein',
      metric: 'protein',
      label: 'protein',
      shown: protein,
      precision: 0,
      unit: 'g',
      ratio: ratioOf(protein, proteinTarget),
      caption: proteinTarget > 0 ? `of ${formatNumber(proteinTarget)} g` : noTarget,
      name: sentence('Protein', protein, proteinTarget, 'g'),
    },
    {
      id: 'water',
      metric: 'water',
      label: 'water',
      shown: waterMl / 1000,
      precision: litrePrecision(waterMl),
      unit: 'L',
      ratio: ratioOf(waterMl, waterTarget),
      caption: `of ${litres(waterTarget)} L`,
      name: sentence('Water', waterMl, waterTarget, 'ml'),
    },
    {
      id: 'steps',
      metric: 'steps',
      label: 'steps',
      shown: steps,
      precision: 0,
      ratio: ratioOf(steps, stepsTarget),
      caption: steps === null ? 'Not logged' : stepsTarget > 0 ? `of ${formatNumber(stepsTarget)}` : null,
      name: sentence('Steps', steps, stepsTarget, 'steps'),
    },
    {
      id: 'sleep',
      metric: 'sleep',
      label: 'sleep',
      shown: sleepH,
      precision: 1,
      unit: 'h',
      ratio: ratioOf(sleepH, SLEEP_TARGET_H),
      caption: sleepH === null ? 'Not logged' : `of ${formatNumber(SLEEP_TARGET_H, 1)} h`,
      name: sentence('Sleep', sleepH, SLEEP_TARGET_H, 'h', 1),
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
  /** When the day was last read (the query's `dataUpdatedAt`), for "As of". */
  readAt: number
  pending: PendingToday
  waterTargetMl: number
  onAddHealth: () => void
}

/** The white card, a size container (the gauges size by `cqi`), padded as the mock's fuel card. */
const CARD = {
  ...cardSurface,
  ...sizeContainer,
  minWidth: 0,
  px: 'clamp(16px, 4vw, 28px)',
  py: 'clamp(18px, 4vw, 26px)',
} as const

function Header({ id, readAt }: { id: string; readAt: number | null }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '4px 12px',
      }}
    >
      <Box component="h2" id={id} sx={{ ...displayTitle('section'), m: 0, minWidth: 0 }}>
        Today’s fuel
      </Box>
      {readAt !== null && (
        <Box component="span" sx={{ fontSize: tokens.font.size.body, color: tokens.ink.muted }}>
          As of {formatClock(new Date(readAt).toISOString())}
        </Box>
      )}
    </Box>
  )
}

export function TodayRings({ day, loading, readAt, pending, waterTargetMl, onAddHealth }: TodayRingsProps) {
  const now = useMinuteClock()
  const titleId = useId()
  if (loading || !day)
    return (
      <Box
        component="section"
        aria-labelledby={titleId}
        aria-busy="true"
        data-testid="today-rings-loading"
        sx={CARD}
      >
        <Header id={titleId} readAt={null} />
        <Skeleton variant="rounded" sx={{ mt: 'clamp(14px, 4cqi, 22px)', height: GAUGES_HEIGHT }} />
      </Box>
    )

  const missingHealth =
    (day.steps ?? pending.steps) === null || (day.sleep?.asleep_min ?? pending.sleepMin) === null
  const fast = fastLabel(day, pending, now)
  return (
    <Box component="section" aria-labelledby={titleId} data-testid="today-rings" sx={CARD}>
      <Header id={titleId} readAt={readAt > 0 ? readAt : null} />
      <Box sx={{ mt: 'clamp(14px, 4cqi, 22px)' }}>
        <CapsuleGaugeRow>
          {gaugesFor(day, pending, waterTargetMl).map((g, i) => (
            <CapsuleGauge
              key={g.id}
              testId={`today-metric-${g.id}`}
              metric={g.metric}
              value={g.shown}
              target={null}
              ratio={g.ratio}
              label={g.label}
              unit={g.unit}
              display={
                g.shown === null ? (
                  '—'
                ) : (
                  <CountUp value={g.shown} precision={g.precision} delay={gaugeDelay(i)} />
                )
              }
              caption={g.caption}
              ariaLabel={g.name}
              delay={gaugeDelay(i)}
            />
          ))}
        </CapsuleGaugeRow>
      </Box>

      {(fast || pending.count > 0 || pending.meals > 0 || missingHealth) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 2,
            mt: '18px',
            pt: '14px',
            borderTop: `1px solid ${tokens.ink.hairline}`,
          }}
        >
          {fast && <StatusChip testId="fast-badge" tone="warning" icon={TimerRounded} label={fast} />}
          {pending.count > 0 && <PendingBadge count={pending.count} />}
          {pending.meals > 0 && (
            <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.muted }}>
              {pending.meals === 1 ? 'One meal' : `${pending.meals} meals`} will count once synced.
            </Box>
          )}
          {missingHealth && (
            <Button
              variant="outlined"
              size="small"
              onClick={onAddHealth}
              sx={{ ml: 'auto' }}
              data-testid="add-health"
            >
              Add steps or sleep
            </Button>
          )}
        </Box>
      )}
    </Box>
  )
}
