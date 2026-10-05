// Owns: Today's header card — trend weight as the one big number, the change since the start weight, kg to go, the
// projected finish date from the active plan's forecast and the 7-day trend change; today's raw weigh-in de-emphasised
// (marked pending while it waits to sync), or a calm prompt for the first weigh-in.
import ArrowDownwardRounded from '@mui/icons-material/ArrowDownwardRounded'
import ArrowUpwardRounded from '@mui/icons-material/ArrowUpwardRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Skeleton from '@mui/material/Skeleton'
import type { Forecast } from '@fitness/shared/schemas'
import { formatNumber, formatSigned, PendingBadge } from '../../../components'
import { tokens } from '../../../theme'

export interface TodayHeaderProps {
  trendKg: number | null
  /** Today's raw weigh-in (server or queued). */
  rawKg: number | null
  rawPending: boolean
  change7dKg: number | null
  startKg: number | null
  startDate: string | null
  goalKg: number
  forecast: Pick<Forecast, 'finish_date' | 'weekly_rate_kg'> | null
  loading: boolean
  /** Neither the day nor the trend could be read (offline with nothing saved, or an error): no claim about weigh-ins. */
  unavailable: boolean
  onWeighIn: () => void
}

function Fact({ label, value, unit, testId }: { label: string; value: string; unit?: string; testId: string }) {
  return (
    <Box data-testid={testId} sx={{ minWidth: 0 }}>
      <Box sx={{ fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: tokens.ink.secondary, whiteSpace: 'nowrap' }}>
        {label}
      </Box>
      <Box
        sx={{
          mt: 0.5,
          fontSize: 18,
          fontWeight: tokens.font.weight.heading,
          color: tokens.ink.text,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
        {unit && value !== '—' && (
          <Box component="span" sx={{ ml: 1, fontSize: 13, fontWeight: tokens.font.weight.label, color: tokens.ink.secondary }}>
            {unit}
          </Box>
        )}
      </Box>
    </Box>
  )
}

export function TodayHeader(props: TodayHeaderProps) {
  const { trendKg, rawKg, rawPending, change7dKg, startKg, startDate, goalKg, forecast, loading, unavailable, onWeighIn } = props
  if (loading)
    return (
      <Card sx={{ p: 4 }} aria-busy="true">
        <Skeleton variant="text" width={110} />
        <Skeleton variant="text" width={180} sx={{ fontSize: 40 }} />
        <Skeleton variant="text" width={200} />
      </Card>
    )

  const sinceStart = trendKg !== null && startKg !== null ? trendKg - startKg : null
  const toGo = trendKg !== null ? Math.max(0, trendKg - goalKg) : null
  const finish = forecast?.finish_date ?? null
  const flat = sinceStart === null || Math.abs(sinceStart) < 0.05
  const deltaColor = flat ? tokens.ink.secondary : sinceStart! < 0 ? tokens.status.good : tokens.status.flag
  const DeltaIcon = sinceStart !== null && sinceStart < 0 ? ArrowDownwardRounded : ArrowUpwardRounded

  return (
    <Card data-testid="today-header" sx={{ p: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: 24 }}>
        <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: tokens.radius.chip, bgcolor: tokens.metric.weight }} />
        <Box sx={{ flex: 1, fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: tokens.ink.secondary }}>
          Trend weight
        </Box>
        {rawKg !== null && (
          <Box sx={{ fontSize: 13, color: tokens.ink.secondary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            Weigh-in {formatNumber(rawKg, 1)} kg
          </Box>
        )}
        {rawPending && <PendingBadge />}
      </Box>

      {trendKg === null ? (
        <Box sx={{ mt: 2 }}>
          <Box sx={{ fontSize: 18, fontWeight: tokens.font.weight.heading, color: tokens.ink.text }}>
            {unavailable ? 'The trend isn’t on this phone yet' : 'No weigh-ins yet'}
          </Box>
          <Box sx={{ mt: 1, fontSize: 14, color: tokens.ink.secondary, lineHeight: 1.5 }}>
            {unavailable
              ? 'It shows once the app reaches the server. A weigh-in logged now is kept and syncs.'
              : `One morning weigh-in a day is all the trend needs. Goal: ${formatNumber(goalKg, 0)} kg.`}
          </Box>
          <Button variant="contained" onClick={onWeighIn} sx={{ mt: 3 }}>
            Log weigh-in
          </Button>
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, mt: 1.5 }}>
            <Box
              component="span"
              data-testid="today-trend"
              sx={{
                fontSize: tokens.font.size.bigNumberLarge,
                fontWeight: tokens.font.weight.number,
                lineHeight: 1.1,
                letterSpacing: -0.5,
                fontVariantNumeric: 'tabular-nums',
                color: tokens.ink.text,
              }}
            >
              {formatNumber(trendKg, 1)}
            </Box>
            <Box component="span" sx={{ fontSize: 16, fontWeight: tokens.font.weight.label, color: tokens.ink.secondary }}>
              kg
            </Box>
          </Box>
          {sinceStart !== null && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
              {!flat && <DeltaIcon aria-hidden sx={{ fontSize: 16, color: deltaColor }} />}
              <Box component="span" sx={{ fontSize: 14, fontWeight: tokens.font.weight.label, color: deltaColor, whiteSpace: 'nowrap' }}>
                {formatSigned(sinceStart, 1)} kg
              </Box>
              <Box component="span" sx={{ fontSize: 14, color: tokens.ink.secondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                since {startDate ? `${startDate} (${formatNumber(startKg, 1)} kg)` : 'start'}
              </Box>
            </Box>
          )}
          <Box
            sx={{
              mt: 4,
              pt: 3,
              borderTop: `1px solid ${tokens.ink.border}`,
              display: 'grid',
              // The date needs the widest column: "2027-07-20" is ~105 px at 18 px.
              gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.3fr) minmax(0, 0.9fr)',
              gap: 3,
            }}
          >
            <Fact label="To go" value={toGo === null ? '—' : formatNumber(toGo, 1)} unit="kg" testId="today-to-go" />
            <Fact label="Projected finish" value={finish ?? '—'} testId="today-finish" />
            <Fact
              label="7-day trend"
              value={change7dKg === null ? '—' : formatSigned(change7dKg, 1)}
              unit="kg"
              testId="today-change-7d"
            />
          </Box>
          {forecast && !finish && (
            <Box sx={{ mt: 2, fontSize: 13, color: tokens.ink.secondary }}>
              No finish date while the forecast rate is {formatNumber(forecast.weekly_rate_kg, 2)} kg/week.
            </Box>
          )}
        </>
      )}
    </Card>
  )
}
