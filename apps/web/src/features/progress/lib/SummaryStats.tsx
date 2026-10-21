// Owns: the four headline numbers for the selected range (1d summary cards) — trend change with the weekly rate,
// average intake and average protein against their targets, and logging adherence — each a 13/600 muted label, the
// number in Outfit 30 with its unit, and a status pill under it saying what it means. Cards are 150 px columns in a
// row that wraps: four across on a desktop, two on a phone.
// Before the range's data arrives (`summary` null) the cards show dashes and hold their pills' room, so the row has
// its final height from the first paint and the charts under it never move.
import Box from '@mui/material/Box'
import type { Forecast, TargetValues } from '@fitness/shared/schemas'
import {
  cardSurface,
  CountUp,
  formatNumber,
  formatSigned,
  Reveal,
  staggerDelay,
  statValue,
  type StatusChipTone,
  wrapCol,
  WrapRow,
} from '../../../components'
import { CHIP_TONES, tokens } from '../../../theme'
import type { RangeSummary } from './series'

interface SummaryStatsProps {
  /** Null while the range's days and trend load. */
  summary: RangeSummary | null
  /** The targets the charts' target lines show (latest non-fast day). */
  targets: TargetValues | null
  /** The forecast (the hero's subtitle compares the range's rate with the plan's; kept for callers). */
  forecast: Forecast | null
}

/** A weekly rate needs at least a week of trend between its ends to mean anything. */
const RATE_MIN_DAYS = 7

const delay = (i: number) => staggerDelay(i, 70, 150)

/**
 * The card's status pill (1d: 12/600, 4 × 10, the tone's text on its tint). Unlike the kit's one-line chip it wraps in
 * a phone's half-width card ("−10 vs 130 minimum"), its corners easing from a pill to a rounded box.
 */
function pillSx(tone: StatusChipTone) {
  const t = CHIP_TONES[tone === 'outline' || tone === 'dashed' ? 'neutral' : tone]
  return {
    display: 'inline-block',
    maxWidth: '100%',
    px: '10px',
    py: '3px',
    borderRadius: '11px',
    bgcolor: t.bg,
    color: tone === 'neutral' ? tokens.summit.ink.deep : t.text,
    fontSize: tokens.font.size.caption,
    fontWeight: tokens.font.weight.heading,
    lineHeight: '16px',
    fontVariantNumeric: 'tabular-nums',
  } as const
}

interface CardProps {
  label: string
  /** The number as shown, or null for a dash. */
  value: number | null
  /** Shown instead of `value` as text (a signed change keeps its sign). */
  text?: string
  unit: string
  precision?: number
  countUp?: boolean
  /** The pill under the number; null while loading (its room is held), undefined for none. */
  pill: { tone: StatusChipTone; label: string } | null | undefined
  index: number
  testId: string
}

/** One 1d summary card: label, number + unit, the pill under it. */
function SummaryCard({ label, value, text, unit, precision = 0, countUp, pill, index, testId }: CardProps) {
  return (
    <Box sx={{ ...wrapCol(1, tokens.layout.wrapBasis.tile), display: 'flex' }}>
      <Reveal delay={delay(index)} sx={{ width: '100%' }}>
        <Box
          data-testid={testId}
          sx={{
            ...cardSurface,
            borderRadius: `${tokens.radius.tile}px`,
            height: '100%',
            boxSizing: 'border-box',
            px: '24px',
            py: '20px',
            minWidth: 0,
          }}
        >
          <Box
            sx={{
              fontSize: tokens.font.size.label,
              fontWeight: tokens.font.weight.heading,
              color: tokens.ink.secondary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {label}
          </Box>
          <Box
            sx={{
              mt: '6px',
              display: 'flex',
              alignItems: 'baseline',
              flexWrap: 'wrap',
              columnGap: '6px',
              ...statValue('standard'),
              lineHeight: 1.15,
              color: tokens.ink.text,
            }}
          >
            <span>
              {value === null ? (
                '—'
              ) : text ? (
                text
              ) : countUp ? (
                <CountUp value={value} precision={precision} delay={delay(index) + 300} />
              ) : (
                formatNumber(value, precision)
              )}
            </span>
            {value !== null && (
              <Box
                component="span"
                sx={{
                  fontFamily: tokens.font.family,
                  fontSize: tokens.font.size.body,
                  fontWeight: tokens.font.weight.label,
                  letterSpacing: 0,
                  color: tokens.ink.secondary,
                }}
              >
                {unit}
              </Box>
            )}
          </Box>
          <Box sx={{ mt: '8px', minHeight: 22, display: 'flex' }}>
            {pill === null ? (
              <Box aria-hidden sx={{ ...pillSx('neutral'), visibility: 'hidden' }}>
                –
              </Box>
            ) : pill ? (
              <Box component="span" sx={pillSx(pill.tone)}>
                {pill.label}
              </Box>
            ) : null}
          </Box>
        </Box>
      </Reveal>
    </Box>
  )
}

export function SummaryStats({ summary, targets }: SummaryStatsProps) {
  const s = summary
  const change = s?.trendChangeKg ?? null
  // Rate = trend change ÷ (days between the first and last trend point ÷ 7), kg/week.
  const rate = change !== null && s && s.trendDays >= RATE_MIN_DAYS ? change / (s.trendDays / 7) : null
  const kcalTarget = targets?.kcal ?? null
  const proteinTarget = targets?.protein_g ?? null
  const avgKcal = s?.avgKcal == null ? null : Math.round(s.avgKcal)
  const avgProtein = s?.avgProteinG == null ? null : Math.round(s.avgProteinG)

  const ratePill =
    s === null
      ? null
      : rate === null
        ? undefined
        : {
            tone: (rate < 0 ? 'success' : 'warning') as StatusChipTone,
            label: `${formatSigned(rate, 2)} kg a week`,
          }
  const kcalPill =
    s === null
      ? null
      : avgKcal !== null && kcalTarget
        ? {
            tone: 'neutral' as StatusChipTone,
            label: `${formatSigned(avgKcal - kcalTarget, 0)} vs ${formatNumber(kcalTarget)}`,
          }
        : undefined
  const proteinPill =
    s === null
      ? null
      : avgProtein !== null && proteinTarget
        ? {
            tone: (avgProtein >= proteinTarget ? 'success' : 'warning') as StatusChipTone,
            label: `${formatSigned(avgProtein - proteinTarget, 0)} vs ${formatNumber(proteinTarget)} minimum`,
          }
        : undefined
  const adherencePill =
    s === null
      ? null
      : {
          tone: (s.adherentDays === s.days ? 'success' : 'neutral') as StatusChipTone,
          label: `${s.adherentDays} of ${s.days} days logged`,
        }

  return (
    <Box data-testid="progress-summary" aria-busy={summary === null || undefined}>
      <WrapRow gap={tokens.summit.space.gap.tile}>
        <SummaryCard
          index={0}
          label="Trend change"
          value={change}
          text={change === null ? undefined : formatSigned(change, 1)}
          unit="kg"
          pill={ratePill}
          testId="stat-trend-change"
        />
        <SummaryCard
          index={1}
          label="Average intake"
          value={avgKcal}
          unit="kcal"
          countUp
          pill={kcalPill}
          testId="stat-avg-kcal"
        />
        <SummaryCard
          index={2}
          label="Average protein"
          value={avgProtein}
          unit="g"
          countUp
          pill={proteinPill}
          testId="stat-avg-protein"
        />
        <SummaryCard
          index={3}
          label="Adherence"
          value={s?.adherence == null ? null : Math.round(s.adherence * 100)}
          unit="%"
          countUp
          pill={adherencePill}
          testId="stat-adherence"
        />
      </WrapRow>
    </Box>
  )
}
