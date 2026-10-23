// Owns: 1d's "Weekly loss vs expected" card, shared by the Dashboard and Progress — each whole Monday–Sunday week's
// trend change as a wide ramp bar against the forecast's expected loss (the dashed gold line), the weeks it covers
// ("Sep 28 – Oct 18"), a subtitle saying how many weeks landed inside the forecast's ±band and naming the dashed line in the
// plan's amber, and the empty slot before the first full week. Data in (GET /api/trend's series), card out.
import Box from '@mui/material/Box'
import { addDays } from '@fitness/shared/engine'
import type { LocalDate, TrendSeries } from '@fitness/shared/schemas'
import { WeeklyLossChart } from '../../../charts'
import { ChartCard, formatDayRange, formatNumber } from '../../../components'
import { tokens } from '../../../theme'
import { forecastBandPercent, weeklyLoss } from './series'

/** The Monday–Sunday span the bars cover, as dates: "Sep 28 – Oct 18" (not ISO week numbers). */
const span = (first: LocalDate, last: LocalDate) => formatDayRange(first, addDays(last, 6))

export interface WeeklyLossCardProps {
  /** The trend series (its points and forecast); null when there is none for the window. */
  trend: TrendSeries | null | undefined
  /** The bars' plot height. */
  height: number
  /** Fill the row's height (a row of cards ends level). */
  fill?: boolean
  /** `card` for a card in a grid of cards (Progress); default `section`. */
  titleSize?: 'section' | 'card'
  testId?: string
}

export function WeeklyLossCard({ trend, height, fill, titleSize, testId }: WeeklyLossCardProps) {
  const rate = trend?.forecast?.weekly_rate_kg ?? null
  const weeks = trend ? weeklyLoss(trend.points, rate) : []
  const band = forecastBandPercent(trend?.forecast)
  // A week is inside the band when |lost − rate| ≤ rate × band / 100 (lost = −change).
  const inside =
    rate !== null && band !== null
      ? weeks.filter((w) => Math.abs(-w.change - rate) <= (rate * band) / 100).length
      : null
  const share =
    inside === null || weeks.length === 0
      ? null
      : inside === weeks.length
        ? `${weeks.length === 1 ? 'The week' : weeks.length === 2 ? 'Both weeks' : `All ${weeks.length} weeks`} inside the ±${band} % band`
        : `${inside} of ${weeks.length} weeks inside the ±${band} % band`
  const first = weeks[0]
  const last = weeks.at(-1)
  return (
    <ChartCard
      fill={fill}
      titleSize={titleSize}
      title="Weekly loss vs expected"
      subtitle={
        <>
          {share ?? 'Trend change per Monday–Sunday week'}
          {rate !== null && (
            <>
              {' · '}
              <Box component="span" sx={{ color: tokens.tone.warning.text }}>
                dashed line = {formatNumber(rate, 2)} kg expected
              </Box>
            </>
          )}
        </>
      }
      action={
        first && last ? (
          <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
            {span(first.week, last.week)}
          </Box>
        ) : undefined
      }
      empty={
        weeks.length
          ? null
          : { title: 'No full week yet', body: 'A full Monday–Sunday week of weigh-ins draws the first bar.' }
      }
      testId={testId}
    >
      <WeeklyLossChart weeks={weeks} height={height} legend={false} />
    </ChartCard>
  )
}
