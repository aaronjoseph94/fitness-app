// Owns: the top of the Log tab for one day — kcal eaten against the day's target with what is left, protein / carbs /
// fat / fibre bars against their targets (GET /api/day/:date), the fast-day note, and the day's weigh-in with an edit.
// While the day loads both cards keep their loaded rows with placeholders in the values, so the meals below never move.
import EditOutlined from '@mui/icons-material/EditOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import { endpoints } from '@fitness/shared/api'
import type { DayView } from '@fitness/shared/schemas'
import { formatNumber, LoadProblem, PendingBadge } from '../../../components'
import { tokens } from '../../../theme'
import { usePendingLogs } from '../../quick-log'

interface DayHeaderProps {
  date: string
  day: DayView | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
  /** Meals waiting to sync whose kcal is not in the server total yet. */
  pendingMeals: number
  onWeighIn: () => void
}

export function DayHeader({ date, day, isLoading, error, onRetry, pendingMeals, onWeighIn }: DayHeaderProps) {
  if (isLoading && !day) return <DayHeaderSkeleton />
  if (!day) return <LoadProblem what={`The day ${date}`} error={error} onRetry={onRetry} />

  const t = day.targets
  const eaten = day.intake.total
  const left = day.remaining?.kcal ?? (t ? t.kcal - eaten.kcal : null)
  const fastDay = day.fast.is_fast_day || t?.is_fast_day === true

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      <Card sx={{ p: 4 }} data-testid="day-totals">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: 24 }}>
          <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: tokens.radius.chip, bgcolor: tokens.metric.calories }} />
          <Box sx={{ flex: 1, fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: 'text.secondary' }}>Eaten</Box>
          {fastDay && <Chip size="small" label="Fast day" sx={{ bgcolor: tokens.metric.fasting, color: tokens.ink.card }} />}
          {pendingMeals > 0 && <PendingBadge label="Meals pending" count={pendingMeals} />}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mt: 1.5, flexWrap: 'wrap' }}>
          <Box component="span" sx={{ fontSize: tokens.font.size.bigNumber, fontWeight: tokens.font.weight.number, lineHeight: 1.1, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums' }}>
            {formatNumber(eaten.kcal)}
          </Box>
          <Box component="span" sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.label, color: 'text.secondary' }}>
            {t ? `of ${formatNumber(t.kcal)} kcal` : 'kcal'}
          </Box>
        </Box>
        <Box sx={{ fontSize: tokens.font.size.small, color: 'text.secondary', mt: 1 }}>
          {fastDay
            ? 'Fast day: intake expected 0. Water target is up.'
            : left === null
              ? 'No targets for this day yet.'
              : left >= 0
                ? `${formatNumber(left)} kcal left`
                : `${formatNumber(-left)} kcal over the target`}
          {' · '}
          {formatNumber(day.intake.meals_logged)} {day.intake.meals_logged === 1 ? 'meal' : 'meals'} logged
        </Box>
        <Box sx={{ display: 'grid', gap: 2.5, mt: 4 }}>
          <MacroBar label="Protein" color={tokens.metric.protein} value={eaten.protein_g} target={t?.protein_g ?? null} />
          <MacroBar label="Carbs" color={tokens.metric.carbs} value={eaten.carbs_g} target={t?.carbs_g ?? null} />
          <MacroBar label="Fat" color={tokens.metric.fat} value={eaten.fat_g} target={t?.fat_g ?? null} />
          {/* No fibre colour in the palette yet: neutral grey rather than borrowing another metric's colour. */}
          <MacroBar label="Fibre" color={tokens.chart.target} value={eaten.fibre_g} target={t?.fibre_g ?? null} />
        </Box>
      </Card>
      <WeighInCard date={date} day={day} onWeighIn={onWeighIn} />
    </Box>
  )
}

const MACROS = ['Protein', 'Carbs', 'Fat', 'Fibre'] as const

/** A value still loading: a text-line placeholder in the value's own font, so the line keeps its height. */
const pendingValue = (width: number) => <Skeleton variant="text" width={width} />

/** Both cards while the day loads, row for row the loaded cards' boxes. */
function DayHeaderSkeleton() {
  return (
    <Box sx={{ display: 'grid', gap: 3 }} aria-busy="true" data-testid="day-totals-loading">
      <Card sx={{ p: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: 24 }}>
          <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: tokens.radius.chip, bgcolor: tokens.metric.calories }} />
          <Box sx={{ flex: 1, fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: 'text.secondary' }}>Eaten</Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'baseline', mt: 1.5, fontSize: tokens.font.size.bigNumber, lineHeight: 1.1 }}>
          {pendingValue(150)}
        </Box>
        <Box sx={{ fontSize: tokens.font.size.small, mt: 1 }}>{pendingValue(200)}</Box>
        <Box sx={{ display: 'grid', gap: 2.5, mt: 4 }}>
          {MACROS.map((label) => (
            <MacroBar key={label} label={label} color={tokens.chart.grid} value={null} target={null} />
          ))}
        </Box>
      </Card>
      <Card sx={{ px: 4, py: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
        <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: tokens.radius.chip, bgcolor: tokens.metric.weight, flex: 'none' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: 'text.secondary' }}>Weigh-in</Box>
          <Box sx={{ display: 'flex', alignItems: 'baseline', fontSize: 22 }}>{pendingValue(90)}</Box>
        </Box>
        <Skeleton variant="rounded" width={72} height={tokens.tapTarget} />
      </Card>
    </Box>
  )
}

/** One macro against its target; `value` null while the day loads. */
function MacroBar({ label, color, value, target }: { label: string; color: string; value: number | null; target: number | null }) {
  const ratio = value !== null && target && target > 0 ? Math.min(1, value / target) : 0
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: tokens.font.size.label, mb: 0.75 }}>
        <Box component="span" sx={{ fontWeight: tokens.font.weight.label }}>
          {label}
        </Box>
        <Box component="span" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
          {value === null ? pendingValue(56) : formatNumber(value)}
          {value !== null && (target !== null ? ` / ${formatNumber(target)} g` : ' g')}
        </Box>
      </Box>
      <Box
        role="meter"
        aria-label={label}
        aria-valuenow={value === null ? undefined : Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={target ?? undefined}
        sx={{ height: 6, borderRadius: tokens.radius.chip, bgcolor: tokens.chart.grid, overflow: 'hidden' }}
      >
        <Box sx={{ height: '100%', width: `${ratio * 100}%`, bgcolor: color, borderRadius: tokens.radius.chip, transition: 'width 300ms ease' }} />
      </Box>
    </Box>
  )
}

function WeighInCard({ date, day, onWeighIn }: { date: string; day: DayView; onWeighIn: () => void }) {
  const pending = usePendingLogs(endpoints.body.createWeight).filter((p) => p.body.date === date).at(-1)
  const raw = pending?.body.weight_kg ?? day.weight.raw_kg
  return (
    <Card sx={{ px: 4, py: 3, display: 'flex', alignItems: 'center', gap: 3 }} data-testid="log-weigh-in">
      <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: tokens.radius.chip, bgcolor: tokens.metric.weight, flex: 'none' }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: 'text.secondary' }}>Weigh-in</Box>
        {raw !== null ? (
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, flexWrap: 'wrap' }}>
            <Box component="span" sx={{ fontSize: 22, fontWeight: tokens.font.weight.number, fontVariantNumeric: 'tabular-nums' }}>
              {formatNumber(raw, 1)} kg
            </Box>
            {day.weight.trend_kg !== null && (
              <Box component="span" sx={{ fontSize: tokens.font.size.small, color: 'text.secondary' }}>
                trend {formatNumber(day.weight.trend_kg, 1)} kg
              </Box>
            )}
            {pending && <PendingBadge />}
          </Box>
        ) : (
          <Box sx={{ fontSize: tokens.font.size.emphasis, color: 'text.secondary' }}>None for {date}</Box>
        )}
      </Box>
      {raw !== null ? (
        <Button variant="text" startIcon={<EditOutlined />} onClick={onWeighIn}>
          Edit
        </Button>
      ) : (
        <Button variant="outlined" onClick={onWeighIn}>
          Log
        </Button>
      )}
    </Card>
  )
}
