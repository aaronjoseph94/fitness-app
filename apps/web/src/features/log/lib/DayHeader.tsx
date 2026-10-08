// Owns: the top of the Log tab for one day (2a: one card in three parts) — kcal eaten against the day's target with
// what is left and how many slots are logged; protein / carbs / fat / fibre bars against their targets (GET
// /api/day/:date); the fast-day note; and the day's weigh-in with its trend, the 7-day change and an edit. While the day
// loads the card keeps its parts with placeholders in the values, so the meals below never move.
import LocalFireDepartmentOutlined from '@mui/icons-material/LocalFireDepartmentOutlined'
import MonitorWeightOutlined from '@mui/icons-material/MonitorWeightOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import type SvgIcon from '@mui/material/SvgIcon'
import { endpoints } from '@fitness/shared/api'
import type { DayView } from '@fitness/shared/schemas'
import type { ReactNode } from 'react'
import { cardSurface, CountUp, formatNumber, formatSigned, LoadProblem, MeterRow, PendingBadge, ProgressBar, statValue, StatusChip } from '../../../components'
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
  onWeighIn: () => void
}

const BORDER = `1px solid ${tokens.ink.border}`

/**
 * The three parts: one column on a phone; from `md` eaten | weigh-in over the macros; from `lg` 2a's
 * 1.1 : 2 : 1 row. Hairlines separate the parts in every arrangement.
 */
const cardSx = {
  ...cardSurface,
  display: 'grid',
  gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))', lg: 'minmax(0, 1.1fr) minmax(0, 2fr) minmax(0, 1fr)' },
  minWidth: 0,
} as const
const partSx = { px: `${tokens.pad.card.x}px`, py: `${tokens.pad.card.y}px`, minWidth: 0 } as const
const eatenSx = { ...partSx, borderRight: { md: BORDER } } as const
const macrosSx = {
  ...partSx,
  // The macro grid picks its columns from this part's own width (see MacroGrid).
  containerType: 'inline-size',
  gridColumn: { md: '1 / -1', lg: 'auto' },
  order: { md: 3, lg: 0 },
  borderTop: { xs: BORDER, lg: 0 },
  borderRight: { lg: BORDER },
} as const
const weighInSx = { ...partSx, borderTop: { xs: BORDER, md: 0 } } as const

/** A part's label: 13/500 secondary with a 16 px faint glyph (2a "Eaten today", "Weigh-in"). */
function PartLabel({ icon: Icon, children, extra }: { icon?: typeof SvgIcon; children: ReactNode; extra?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: 20, fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: tokens.ink.label }}>
      {Icon && <Icon aria-hidden sx={{ fontSize: 16, color: tokens.ink.faint }} />}
      <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
        {children}
      </Box>
      {extra}
    </Box>
  )
}

/** The part's big number (34/600, −.03em) and its unit (13 muted). */
function BigValue({ value, unit }: { value: ReactNode; unit: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '6px', mt: '10px', flexWrap: 'wrap' }}>
      <Box
        component="span"
        sx={{ ...statValue('medium'), lineHeight: 1 }}
      >
        {value}
      </Box>
      <Box component="span" sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>
        {unit}
      </Box>
    </Box>
  )
}

const captionSx = { fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.caption, color: tokens.ink.secondary } as const
const strongSx = { fontWeight: tokens.font.weight.heading, color: tokens.ink.text } as const

export function DayHeader({ date, isToday, day, isLoading, error, onRetry, pendingMeals, onWeighIn }: DayHeaderProps) {
  if (isLoading && !day) return <DayHeaderSkeleton isToday={isToday} />
  if (!day) return <LoadProblem what={`The day ${date}`} error={error} onRetry={onRetry} />

  const t = day.targets
  const eaten = day.intake.total
  const left = day.remaining?.kcal ?? (t ? t.kcal - eaten.kcal : null)
  const fastDay = day.fast.is_fast_day || t?.is_fast_day === true
  const slots = visibleSlots()
  const loggedSlots = slots.filter((s) => day.intake.by_slot[s] !== undefined).length
  // The first slot with nothing in it yet, and its planned share of the day (as the slot cards below show it).
  const nextSlot = slots.find((s) => day.intake.by_slot[s] === undefined)
  const nextPlanned = nextSlot && t && !fastDay ? Math.round((t.kcal * slotShare(nextSlot)) / 10) * 10 : null

  return (
    <Box component="section" aria-label="The day so far" sx={cardSx} data-testid="day-totals">
      <Box sx={eatenSx}>
        <PartLabel
          icon={LocalFireDepartmentOutlined}
          extra={
            <>
              {fastDay && <StatusChip tone="warning" size="small" label="Fast day" />}
              {pendingMeals > 0 && <PendingBadge label="Meals pending" count={pendingMeals} />}
            </>
          }
        >
          {isToday ? 'Eaten today' : 'Eaten'}
        </PartLabel>
        <BigValue value={<CountUp value={eaten.kcal} delay={300} />} unit={t ? `/ ${formatNumber(t.kcal)} kcal` : 'kcal'} />
        <Box sx={{ mt: '12px' }}>
          <ProgressBar value={t && t.kcal > 0 ? eaten.kcal / t.kcal : null} metric="calories" label="Calories against the day's target" delay={300} />
        </Box>
        <Box sx={{ ...captionSx, mt: 2 }}>
          <Box component="span" sx={strongSx}>
            {fastDay
              ? 'Fast day: intake expected 0. Water target is up.'
              : left === null
                ? 'No targets for this day yet.'
                : left >= 0
                  ? `${formatNumber(left)} kcal left`
                  : `${formatNumber(-left)} kcal over the target`}
          </Box>
          {` · ${loggedSlots} of ${slots.length} slots logged`}
          {nextSlot && nextPlanned !== null && ` · ${SLOT_LABEL[nextSlot].toLowerCase()} planned ${formatNumber(nextPlanned)}`}
        </Box>
      </Box>

      <Box sx={macrosSx}>
        <PartLabel>Macros against {isToday ? 'today’s' : 'the day’s'} targets</PartLabel>
        <MacroGrid>
          <MacroBar label="Protein" color={tokens.metric.protein} value={eaten.protein_g} target={t?.protein_g ?? null} kind="priority" />
          <MacroBar label="Carbs" color={tokens.metric.carbs} value={eaten.carbs_g} target={t?.carbs_g ?? null} kind="limit" />
          <MacroBar label="Fat" color={tokens.metric.fat} value={eaten.fat_g} target={t?.fat_g ?? null} kind="minimum" />
          {/* No fibre colour in the metric palette: 2a's fibre green is the success tone's solid. */}
          <MacroBar label="Fibre" color={tokens.tone.success.solid} value={eaten.fibre_g} target={t?.fibre_g ?? null} kind="limit" />
        </MacroGrid>
      </Box>

      <WeighIn date={date} day={day} onWeighIn={onWeighIn} />
    </Box>
  )
}

/**
 * The macro columns: four across once the part is 500 px wide (2a at 1440, and the full-width row at `md`), else two (a
 * phone, and the narrow middle part at 1280). 12 px between columns (2a: 16), so "Protein 124 / 130 g" still fits one
 * line in a 1440 column; aligned on their bars, so a value that does wrap under its label lifts only its own label.
 */
function MacroGrid({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        '@container (min-width: 500px)': { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' },
        alignItems: 'end',
        gap: '16px 12px',
        mt: '10px',
      }}
    >
      {children}
    </Box>
  )
}

const MACROS = ['Protein', 'Carbs', 'Fat', 'Fibre'] as const

/** A value still loading: a text-line placeholder in the value's own font, so the line keeps its height. */
const pendingValue = (width: number) => <Skeleton variant="text" width={width} sx={{ display: 'inline-block' }} />

/** The card while the day loads, part for part the loaded card's boxes. */
function DayHeaderSkeleton({ isToday }: { isToday: boolean }) {
  return (
    <Box sx={cardSx} aria-busy="true" data-testid="day-totals-loading">
      <Box sx={eatenSx}>
        <PartLabel icon={LocalFireDepartmentOutlined}>{isToday ? 'Eaten today' : 'Eaten'}</PartLabel>
        <BigValue value={pendingValue(90)} unit="" />
        <Box sx={{ mt: '12px' }}>
          <ProgressBar value={null} label="Calories against the day's target" />
        </Box>
        {/* Two lines, as the loaded caption wraps on a phone and at 1440. */}
        <Box sx={{ ...captionSx, mt: 2 }}>
          {pendingValue(180)}
          <br />
          {pendingValue(110)}
        </Box>
      </Box>
      <Box sx={macrosSx}>
        <PartLabel>Macros against {isToday ? 'today’s' : 'the day’s'} targets</PartLabel>
        <MacroGrid>
          {MACROS.map((label) => (
            <MeterRow key={label} label={label} value={null} target={null} unit="g" color={tokens.ink.fill} caption={null} loading delay={400} />
          ))}
        </MacroGrid>
      </Box>
      <Box sx={weighInSx}>
        <PartLabel icon={MonitorWeightOutlined}>Weigh-in</PartLabel>
        <BigValue value={pendingValue(80)} unit="" />
        <Box sx={{ ...captionSx, mt: '12px' }}>{pendingValue(150)}</Box>
        {/* The "Edit weigh-in" button's place. */}
        <Skeleton variant="rounded" width={110} height={30} sx={{ mt: '10px' }} />
      </Box>
    </Box>
  )
}

/**
 * How a macro's gap reads: protein is the one to chase ("48 g to go", amber until met), fat's target is a minimum
 * (SPEC §6: "fat minimum 45 g"), carbs and fibre are amounts left.
 */
type MacroKind = 'priority' | 'minimum' | 'limit'

function macroCaption(kind: MacroKind, value: number, target: number): { text: string; tone: 'warning' | 'success' | 'muted' } {
  const gap = Math.round(target - value)
  if (kind === 'priority') return gap > 0 ? { text: `${formatNumber(gap)} g to go`, tone: 'warning' } : { text: 'Target met', tone: 'success' }
  if (kind === 'minimum') return gap > 0 ? { text: `${formatNumber(gap)} g to the minimum`, tone: 'muted' } : { text: 'Minimum met', tone: 'success' }
  return gap >= 0 ? { text: `${formatNumber(gap)} g left`, tone: 'muted' } : { text: `${formatNumber(-gap)} g over`, tone: 'muted' }
}

/** One macro against its target, with how its gap reads under the bar. */
function MacroBar({ label, color, value, target, kind }: { label: string; color: string; value: number; target: number | null; kind: MacroKind }) {
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
  const pending = usePendingLogs(endpoints.body.createWeight).filter((p) => p.body.date === date).at(-1)
  const raw = pending?.body.weight_kg ?? day.weight.raw_kg
  const { trend_kg: trend, change_7d_kg: change } = day.weight
  return (
    <Box sx={weighInSx} data-testid="log-weigh-in">
      <PartLabel icon={MonitorWeightOutlined} extra={pending && <PendingBadge />}>
        Weigh-in
      </PartLabel>
      <BigValue value={raw !== null ? formatNumber(raw, 1) : '—'} unit={raw !== null ? 'kg' : ''} />
      <Box sx={{ ...captionSx, mt: '12px' }}>
        {raw === null ? (
          `None for ${date}`
        ) : trend !== null ? (
          <>
            Trend{' '}
            <Box component="b" sx={strongSx}>
              {formatNumber(trend, 1)} kg
            </Box>
            {change !== null && (
              <>
                {' · '}
                <Box component="span" sx={{ fontWeight: tokens.font.weight.heading, color: change < 0 ? tokens.tone.success.text : tokens.ink.label }}>
                  {formatSigned(change, 1)} kg
                </Box>{' '}
                over 7 days
              </>
            )}
          </>
        ) : (
          'No trend yet'
        )}
      </Box>
      <Button variant="outlined" size="tiny" onClick={onWeighIn} sx={{ mt: '10px' }}>
        {raw !== null ? 'Edit weigh-in' : 'Log weigh-in'}
      </Button>
    </Box>
  )
}
