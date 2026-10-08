// Owns: the weight trend card's numbers (2a) — the headline row (trend weight as the one 34 px number, "kg trend", the
// change since the start weight as a pill, and today's raw weigh-in de-emphasised, marked pending while it waits to
// sync) and the four-stat footer: since the start date, the 7-day change ("on pace" when it is inside or past the
// forecast's band), kg to go to the goal, and the projected finish date with the active plan's forecast rate.
import TrendingDownRounded from '@mui/icons-material/TrendingDownRounded'
import TrendingFlatRounded from '@mui/icons-material/TrendingFlatRounded'
import TrendingUpRounded from '@mui/icons-material/TrendingUpRounded'
import Box from '@mui/material/Box'
import type { Forecast } from '@fitness/shared/schemas'
import { CountUp, formatNumber, formatShortDate, formatSigned, KeyStat, KeyStatGrid, PendingBadge, StatusChip } from '../../../components'
import { tokens } from '../../../theme'

export interface TrendNumbers {
  trendKg: number | null
  /** Today's raw weigh-in (server or queued). */
  rawKg: number | null
  rawPending: boolean
  change7dKg: number | null
  startKg: number | null
  startDate: string | null
  goalKg: number
  forecast: Pick<Forecast, 'finish_date' | 'weekly_rate_kg' | 'band'> | null
}

/** Under this the change since the start reads as flat. */
const FLAT_KG = 0.05

const sinceStartKg = ({ trendKg, startKg }: TrendNumbers) => (trendKg !== null && startKg !== null ? trendKg - startKg : null)

/** "2027-04-09" → "Apr 9, 2027". */
const finishLabel = (date: string) => `${formatShortDate(date)}, ${date.slice(0, 4)}`

export function TrendHeadline(props: TrendNumbers) {
  const { trendKg, rawKg, rawPending, startKg } = props
  const since = sinceStartKg(props)
  const flat = since === null || Math.abs(since) < FLAT_KG
  return (
    <Box data-testid="today-header" sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: '10px', rowGap: 1 }}>
      <Box
        component="span"
        data-testid="today-trend"
        sx={{
          fontSize: tokens.font.size.bigNumberMedium,
          fontWeight: tokens.font.weight.number,
          lineHeight: tokens.font.leading.number,
          letterSpacing: tokens.font.em.hero,
          fontVariantNumeric: 'tabular-nums',
          color: tokens.ink.text,
        }}
      >
        {trendKg === null ? '—' : <CountUp value={trendKg} from={startKg ?? trendKg} precision={1} delay={300} />}
      </Box>
      <Box component="span" sx={{ fontSize: tokens.font.size.body, color: tokens.ink.muted }}>
        kg trend
      </Box>
      {since !== null && (
        <Box component="span" sx={{ alignSelf: 'center' }}>
          <StatusChip
            tone={flat ? 'neutral' : since < 0 ? 'success' : 'warning'}
            shape="pill"
            icon={flat ? TrendingFlatRounded : since < 0 ? TrendingDownRounded : TrendingUpRounded}
            label={`${formatNumber(Math.abs(since), 1)} kg`}
            ariaLabel={`${formatSigned(since, 1)} kg since the start`}
          />
        </Box>
      )}
      {rawKg !== null && (
        <Box component="span" sx={{ fontSize: tokens.font.size.small, color: tokens.ink.muted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          Weigh-in {formatNumber(rawKg, 1)} kg
        </Box>
      )}
      {rawPending && (
        <Box component="span" sx={{ alignSelf: 'center' }}>
          <PendingBadge />
        </Box>
      )}
    </Box>
  )
}

export function TrendFacts(props: TrendNumbers) {
  const { trendKg, change7dKg, startKg, startDate, goalKg, forecast } = props
  const since = sinceStartKg(props)
  const toGo = trendKg !== null ? Math.max(0, trendKg - goalKg) : null
  const finish = forecast?.finish_date ?? null
  // The week's loss at or above the slow edge of the plan's ±20 % band (SPEC §9): −change_7d ≥ weekly_rate × 0.8.
  const onPace = change7dKg !== null && forecast !== null && forecast.weekly_rate_kg > 0 && -change7dKg >= forecast.band.low
  return (
    <KeyStatGrid>
      <KeyStat
        label={startDate ? `Since ${formatShortDate(startDate)}` : 'Since start'}
        value={since === null ? '—' : formatSigned(since, 1)}
        unit={since === null ? undefined : 'kg'}
        caption={startKg !== null ? `from ${formatNumber(startKg, 1)}` : undefined}
      />
      <KeyStat
        label="7-day change"
        value={change7dKg === null ? '—' : formatSigned(change7dKg, 1)}
        unit={change7dKg === null ? undefined : 'kg'}
        caption={onPace ? 'on pace' : undefined}
        captionTone="success"
        testId="today-change-7d"
      />
      <KeyStat
        label="To go"
        value={toGo === null ? '—' : formatNumber(toGo, 1)}
        unit={toGo === null ? undefined : 'kg'}
        caption={`to ${formatNumber(goalKg, 0)}`}
        testId="today-to-go"
      />
      <KeyStat
        label="Projected finish"
        value={finish ? finishLabel(finish) : '—'}
        caption={forecast ? `at ${formatNumber(forecast.weekly_rate_kg, 2)} kg/wk` : undefined}
        testId="today-finish"
      />
    </KeyStatGrid>
  )
}
