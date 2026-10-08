// Owns: the four headline numbers for the selected range (2a stat cards) — trend change with the weekly rate, average
// intake and average protein against their targets, and logging adherence — each a big number with a pill right of
// it and a caption saying what it is. Two per row on a phone, four across from 900 px.
// Before the range's data arrives (`summary` null) the cards show dashes with captions of the same length and hold
// their pills' room (`delta={null}`), so the grid has its final height from the first paint and the charts under it
// never move.
import Box from '@mui/material/Box'
import type { Forecast, TargetValues } from '@fitness/shared/schemas'
import { formatNumber, formatSigned, Reveal, StatCard, staggerDelay, StatusChip } from '../../../components'
import { tokens } from '../../../theme'
import type { RangeSummary } from './series'

interface SummaryStatsProps {
  /** Null while the range's days and trend load. */
  summary: RangeSummary | null
  /** The targets the charts' target lines show (latest non-fast day). */
  targets: TargetValues | null
  forecast: Forecast | null
}

/** A weekly rate needs at least a week of trend between its ends to mean anything. */
const RATE_MIN_DAYS = 7

/** Each card fills its grid cell, so a row of cards shares one height. */
const FILL = { height: '100%' }

const delay = (i: number) => staggerDelay(i, tokens.motion.stagger.card, 150)

/** A phone card with its numbers in: label, value, the delta pill on a row of its own, a two-line caption. Each phone
 * row is at least this tall, so the rows hold their height when the range's numbers and captions land. */
const PHONE_CARD_HEIGHT = 165

export function SummaryStats({ summary, targets, forecast }: SummaryStatsProps) {
  const s = summary
  const change = s?.trendChangeKg ?? null
  // Rate = trend change ÷ (days between the first and last trend point ÷ 7), kg/week.
  const rate = change !== null && s && s.trendDays >= RATE_MIN_DAYS ? change / (s.trendDays / 7) : null
  const kcalTarget = targets?.kcal ?? null
  const proteinTarget = targets?.protein_g ?? null
  const avgKcal = s?.avgKcal == null ? null : Math.round(s.avgKcal)
  const avgProtein = s?.avgProteinG == null ? null : Math.round(s.avgProteinG)
  const logged = s?.loggedDays ?? null
  const trendLine =
    s?.trendFromKg != null && s.trendToKg != null ? `${formatNumber(s.trendFromKg, 1)} → ${formatNumber(s.trendToKg, 1)} kg` : 'Trend at the start and end of the range'
  const expected = forecast && forecast.weekly_rate_kg > 0 ? ` · expected ${formatSigned(-forecast.weekly_rate_kg, 2)} a week` : ''

  return (
    <Box
      data-testid="progress-summary"
      aria-busy={summary === null || undefined}
      sx={{
        display: 'grid',
        gap: 4,
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
        gridAutoRows: { xs: `minmax(${PHONE_CARD_HEIGHT}px, auto)`, sm: 'auto' },
      }}
    >
      <Reveal delay={delay(0)} sx={FILL}>
        <StatCard
          label="Trend change"
          value={change === null ? null : formatSigned(change, 1)}
          unit="kg"
          precision={2}
          delta={s === null ? null : rate === null ? undefined : { value: rate, unit: 'kg/wk', good: 'down' }}
          footnote={`${trendLine}${expected}`}
          testId="stat-trend-change"
        />
      </Reveal>
      <Reveal delay={delay(1)} sx={FILL}>
        <StatCard
          label="Average intake"
          value={avgKcal}
          unit="kcal"
          delta={
            s === null
              ? null
              : avgKcal !== null && kcalTarget
                ? { value: avgKcal - kcalTarget, unit: '', period: `vs ${formatNumber(kcalTarget)}`, good: 'neutral' }
                : undefined
          }
          countUp
          delay={delay(1)}
          footnote={
            logged === null
              ? 'Logged days, fasts excluded'
              : logged
                ? `${logged} logged ${logged === 1 ? 'day' : 'days'}, fasts excluded`
                : 'No meals logged yet'
          }
          testId="stat-avg-kcal"
        />
      </Reveal>
      <Reveal delay={delay(2)} sx={FILL}>
        <StatCard
          label="Average protein"
          value={avgProtein}
          unit="g"
          delta={
            s === null
              ? null
              : avgProtein !== null && proteinTarget
                ? { value: avgProtein - proteinTarget, unit: '', period: `vs ${formatNumber(proteinTarget)}`, good: 'up' }
                : undefined
          }
          countUp
          delay={delay(2)}
          footnote={
            logged && proteinTarget
              ? `Hit the target on ${s!.proteinHitDays} of ${logged} ${logged === 1 ? 'day' : 'days'}`
              : proteinTarget
                ? `Daily average; target ${formatNumber(proteinTarget)} g`
                : 'Daily average'
          }
          testId="stat-avg-protein"
        />
      </Reveal>
      <Reveal delay={delay(3)} sx={FILL}>
        <StatCard
          label="Adherence"
          value={s?.adherence == null ? null : Math.round(s.adherence * 100)}
          unit="%"
          countUp
          delay={delay(3)}
          // A count, not a judgement: green when every day of the range was logged, otherwise the neutral pill. The 22 px
          // pill sits in the 20 px label row without pushing this card's number below its neighbours'. A phone's half-width
          // card has no room for it beside the label, so there the count leads the caption instead.
          badge={
            s ? (
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline-flex' }, my: '-1px' }}>
                <StatusChip tone={s.adherentDays === s.days ? 'success' : 'neutral'} shape="pill" label={`${s.adherentDays} of ${s.days} days`} />
              </Box>
            ) : undefined
          }
          footnote={
            <>
              {s && (
                <Box component="strong" sx={{ display: { sm: 'none' } }}>
                  {s.adherentDays} of {s.days} days ·{' '}
                </Box>
              )}
              Weigh-in, two meals or a fast, and water each day
            </>
          }
          testId="stat-adherence"
        />
      </Reveal>
    </Box>
  )
}
