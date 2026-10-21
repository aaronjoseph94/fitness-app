// Owns: the top of the Log tab for one day (1d Summit: one white card in three parts that wrap, never squeeze) — kcal
// eaten against the day's target with what is left and the calorie floor; protein / carbs / fat / fibre bars against
// their targets, two up from 150 px (GET /api/day/:date); the fast-day note; and the day's weigh-in with its trend, the
// 7-day change and an edit. While the day loads the card keeps its parts with placeholders in the values, so the meals
// below never move. `daySummary` is the hero's one line (kcal left, slots logged, the next slot's plan).
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import { endpoints } from '@fitness/shared/api'
import type { DayView } from '@fitness/shared/schemas'
import type { ReactNode } from 'react'
import {
  cardSurface,
  CountUp,
  eyebrow,
  formatNumber,
  formatShortDate,
  formatSigned,
  LoadProblem,
  MeterRow,
  PendingBadge,
  ProgressBar,
  StatusChip,
  wrapCol,
} from '../../../components'
import { tokens } from '../../../theme'
import { SLOT_LABEL, slotShare, usePendingLogs, visibleSlots } from '../../quick-log'

interface DayHeaderProps {
  date: string
  isToday: boolean
  day: DayView | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
  /** Meals waiting to sync whose kcal is not in the server total yet. */
  pendingMeals: number
  /** The calorie floor (settings rail), when known: the eaten part names it. */
  floor: number | null
  onWeighIn: () => void
}

/** README §4: the day header's parts wrap at X = 260 (1.1 : 1.3 : 1). */
const BASIS = 260
const HAIRLINE = tokens.ink.hairline

/**
 * The card clips each part's outer hairlines at its own edges, so a rule shows only between parts: left of a part
 * beside another, above a part that wrapped under one — in every arrangement, with no rule hanging off an edge.
 */
const cardSx = {
  ...cardSurface,
  display: 'flex',
  flexWrap: 'wrap',
  overflow: 'hidden',
  minWidth: 0,
} as const
const partSx = {
  px: '28px',
  py: '24px',
  minWidth: 0,
  boxShadow: `-1px 0 0 0 ${HAIRLINE}, 0 -1px 0 0 ${HAIRLINE}`,
} as const
const eatenSx = { ...partSx, ...wrapCol(1.1, BASIS) } as const
const macrosSx = { ...partSx, ...wrapCol(1.3, BASIS) } as const
const weighInSx = { ...partSx, ...wrapCol(1, BASIS) } as const

/** A part's eyebrow (13/600 uppercase, +.12em, muted) with chips on its right. */
function PartLabel({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 8px', minHeight: 20 }}>
      <Box component="span" sx={{ ...eyebrow, flex: '1 1 auto', minWidth: 0 }}>
        {children}
      </Box>
      {extra}
    </Box>
  )
}

/** The part's big number (Outfit 300, 40 px, −.02em) and its unit (15/500 muted). */
function BigValue({ value, unit }: { value: ReactNode; unit: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '8px', mt: '8px', flexWrap: 'wrap' }}>
      <Box
        component="span"
        sx={{
          fontFamily: tokens.font.display,
          fontSize: tokens.font.size.bigNumberMedium,
          fontWeight: tokens.font.weight.display,
          letterSpacing: tokens.font.em.title,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </Box>
      <Box
        component="span"
        sx={{
          fontSize: tokens.font.size.emphasis,
          fontWeight: tokens.font.weight.body,
          color: tokens.ink.secondary,
        }}
      >
        {unit}
      </Box>
    </Box>
  )
}

const lineSx = {
  fontSize: tokens.font.size.body,
  fontWeight: tokens.font.weight.body,
  lineHeight: tokens.font.leading.small,
  color: tokens.ink.text,
} as const
const mutedSx = { color: tokens.ink.secondary } as const

/** The slots logged and the next empty slot's planned share, as the hero's line and the eaten part read them. */
export function daySummary(day: DayView): string {
  const t = day.targets
  const fastDay = day.fast.is_fast_day || t?.is_fast_day === true
  const left = day.remaining?.kcal ?? (t ? t.kcal - day.intake.total.kcal : null)
  const slots = visibleSlots()
  const logged = slots.filter((s) => day.intake.by_slot[s] !== undefined).length
  const next = slots.find((s) => day.intake.by_slot[s] === undefined)
  const nextPlanned = next && t && !fastDay ? Math.round((t.kcal * slotShare(next)) / 10) * 10 : null
  return [
    fastDay
      ? 'Fast day'
      : left === null
        ? null
        : left >= 0
          ? `${formatNumber(left)} kcal left`
          : `${formatNumber(-left)} kcal over`,
    `${logged} of ${slots.length} slots logged`,
    next && nextPlanned !== null
      ? `${SLOT_LABEL[next].toLowerCase()} planned at ${formatNumber(nextPlanned)}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function DayHeader({
  date,
  isToday,
  day,
  isLoading,
  error,
  onRetry,
  pendingMeals,
  floor,
  onWeighIn,
}: DayHeaderProps) {
  if (isLoading && !day) return <DayHeaderSkeleton isToday={isToday} />
  if (!day) return <LoadProblem what={`The day ${date}`} error={error} onRetry={onRetry} />

  const t = day.targets
  const eaten = day.intake.total
  const left = day.remaining?.kcal ?? (t ? t.kcal - eaten.kcal : null)
  const fastDay = day.fast.is_fast_day || t?.is_fast_day === true

  return (
    <Box component="section" aria-label="The day so far" sx={cardSx} data-testid="day-totals">
      <Box sx={eatenSx}>
        <PartLabel
          extra={
            <>
              {fastDay && <StatusChip tone="warning" size="small" label="Fast day" />}
              {pendingMeals > 0 && <PendingBadge label="Meals pending" count={pendingMeals} />}
            </>
          }
        >
          {isToday ? 'Eaten today' : 'Eaten'}
        </PartLabel>
        <BigValue
          value={<CountUp value={eaten.kcal} delay={300} />}
          unit={t ? `/ ${formatNumber(t.kcal)} kcal` : 'kcal'}
        />
        <Box sx={{ mt: '16px' }}>
          <ProgressBar
            value={t && t.kcal > 0 ? eaten.kcal / t.kcal : null}
            metric="calories"
            label="Calories against the day's target"
            delay={300}
            height={12}
          />
        </Box>
        <Box sx={{ ...lineSx, mt: '10px' }}>
          {fastDay ? (
            <Box component="span" sx={{ color: tokens.tone.warning.text }}>
              Fast day: intake expected 0. Water target is up.
            </Box>
          ) : left === null ? (
            <Box component="span" sx={mutedSx}>
              No targets for this day yet.
            </Box>
          ) : (
            <>
              <Box component="span" sx={{ color: tokens.tone.danger.text }}>
                {left >= 0
                  ? `${formatNumber(left)} kcal left`
                  : `${formatNumber(-left)} kcal over the target`}
              </Box>
              {floor !== null && (
                <Box component="span" sx={mutedSx}>
                  {` · floor ${formatNumber(floor)} · the AI never plans below it`}
                </Box>
              )}
            </>
          )}
        </Box>
      </Box>

      <Box sx={macrosSx}>
        <PartLabel>Macros</PartLabel>
        <MacroGrid>
          <MacroBar
            label="Protein"
            color={tokens.metric.protein}
            value={eaten.protein_g}
            target={t?.protein_g ?? null}
            kind="priority"
          />
          <MacroBar
            label="Carbs"
            color={tokens.metric.carbs}
            value={eaten.carbs_g}
            target={t?.carbs_g ?? null}
            kind="limit"
          />
          <MacroBar
            label="Fat"
            color={tokens.metric.fat}
            value={eaten.fat_g}
            target={t?.fat_g ?? null}
            kind="minimum"
          />
          {/* No fibre colour in the metric palette: 1d draws fibre on the water ramp (teal). */}
          <MacroBar
            label="Fibre"
            color={tokens.metric.water}
            value={eaten.fibre_g}
            target={t?.fibre_g ?? null}
            kind="limit"
          />
        </MacroGrid>
      </Box>

      <WeighIn date={date} day={day} onWeighIn={onWeighIn} />
    </Box>
  )
}

/** The macro bars: README §4 "macro bars 2-up at 150 px" — a wrapping row, one per line once 150 + 150 won't fit. */
function MacroGrid({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        gap: '12px 22px',
        mt: '12px',
        '& > *': { ...wrapCol(1, tokens.layout.wrapBasis.tile) },
      }}
    >
      {children}
    </Box>
  )
}

const MACROS = ['Protein', 'Carbs', 'Fat', 'Fibre'] as const

/** A value still loading: a text-line placeholder in the value's own font, so the line keeps its height. */
const pendingValue = (width: number) => (
  <Skeleton variant="text" width={width} sx={{ display: 'inline-block' }} />
)

/** The card while the day loads, part for part the loaded card's boxes. */
function DayHeaderSkeleton({ isToday }: { isToday: boolean }) {
  return (
    <Box sx={cardSx} aria-busy="true" data-testid="day-totals-loading">
      <Box sx={eatenSx}>
        <PartLabel>{isToday ? 'Eaten today' : 'Eaten'}</PartLabel>
        <BigValue value={pendingValue(90)} unit="" />
        <Box sx={{ mt: '16px' }}>
          <ProgressBar value={null} metric="calories" label="Calories against the day's target" height={12} />
        </Box>
        <Box sx={{ ...lineSx, mt: '10px' }}>{pendingValue(200)}</Box>
      </Box>
      <Box sx={macrosSx}>
        <PartLabel>Macros</PartLabel>
        <MacroGrid>
          {MACROS.map((label) => (
            <MeterRow
              key={label}
              label={label}
              value={null}
              target={null}
              unit="g"
              color={tokens.ink.fill}
              caption={null}
              loading
              delay={400}
            />
          ))}
        </MacroGrid>
      </Box>
      <Box sx={weighInSx}>
        <PartLabel>Weigh-in</PartLabel>
        <BigValue value={pendingValue(80)} unit="" />
        <Box sx={{ ...lineSx, mt: '12px' }}>{pendingValue(150)}</Box>
        {/* The "Edit weigh-in" button's place. */}
        <Skeleton variant="rounded" width={120} height={38} sx={{ mt: '12px', borderRadius: '12px' }} />
      </Box>
    </Box>
  )
}

/**
 * How a macro's gap reads: protein is the one to chase ("48 g to go", amber until met), fat's target is a minimum
 * (SPEC §6: "fat minimum 45 g"), carbs and fibre are amounts left.
 */
type MacroKind = 'priority' | 'minimum' | 'limit'

function macroCaption(
  kind: MacroKind,
  value: number,
  target: number,
): { text: string; tone: 'warning' | 'success' | 'muted' } {
  const gap = Math.round(target - value)
  if (kind === 'priority')
    return gap > 0
      ? { text: `${formatNumber(gap)} g to go`, tone: 'warning' }
      : { text: 'Target met', tone: 'success' }
  if (kind === 'minimum')
    return gap > 0
      ? { text: `${formatNumber(gap)} g to the minimum`, tone: 'muted' }
      : { text: 'Minimum met', tone: 'success' }
  return gap >= 0
    ? { text: `${formatNumber(gap)} g left`, tone: 'muted' }
    : { text: `${formatNumber(-gap)} g over`, tone: 'muted' }
}

/** One macro against its target, with how its gap reads under the bar. */
function MacroBar({
  label,
  color,
  value,
  target,
  kind,
}: {
  label: string
  color: string
  value: number
  target: number | null
  kind: MacroKind
}) {
  const caption = target !== null ? macroCaption(kind, value, target) : null
  return (
    <MeterRow
      label={label}
      value={value}
      target={target}
      unit="g"
      floor={kind === 'minimum'}
      color={color}
      caption={caption?.text ?? null}
      captionTone={caption?.tone}
      delay={400}
    />
  )
}

function WeighIn({ date, day, onWeighIn }: { date: string; day: DayView; onWeighIn: () => void }) {
  const pending = usePendingLogs(endpoints.body.createWeight)
    .filter((p) => p.body.date === date)
    .at(-1)
  const raw = pending?.body.weight_kg ?? day.weight.raw_kg
  const { trend_kg: trend, change_7d_kg: change } = day.weight
  return (
    <Box sx={weighInSx} data-testid="log-weigh-in">
      <PartLabel extra={pending && <PendingBadge />}>Weigh-in</PartLabel>
      <BigValue value={raw !== null ? formatNumber(raw, 1) : '—'} unit={raw !== null ? 'kg' : ''} />
      <Box sx={{ ...lineSx, mt: '12px' }}>
        {raw === null ? (
          <Box component="span" sx={mutedSx}>
            None for {formatShortDate(date)}
          </Box>
        ) : trend !== null ? (
          <>
            Trend {formatNumber(trend, 1)} kg
            {change !== null && (
              <>
                {' · '}
                <Box
                  component="span"
                  sx={{ color: change < 0 ? tokens.tone.success.text : tokens.ink.label }}
                >
                  {formatSigned(change, 1)} kg over 7 days
                </Box>
              </>
            )}
          </>
        ) : (
          <Box component="span" sx={mutedSx}>
            No trend yet
          </Box>
        )}
      </Box>
      <Button variant="outlined" size="dense" onClick={onWeighIn} sx={{ mt: '12px' }}>
        {raw !== null ? 'Edit weigh-in' : 'Log weigh-in'}
      </Button>
    </Box>
  )
}
