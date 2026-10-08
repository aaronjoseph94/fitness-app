// Owns: the "Weight and body" column of Progress (2a) — weight trend with the forecast and its footer (finish date,
// the ± band's goal dates, the next milestone), weekly loss vs the expected rate, and the milestones list, all from
// GET /api/trend. Waist, scans and photos sit in the page's detail section.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { isoWeek } from '@fitness/shared/engine'
import type { LocalDate, TrendSeries } from '@fitness/shared/schemas'
import type { UseQueryResult } from '@tanstack/react-query'
import { Link as RouterLink } from 'react-router'
import type { ApiError } from '../../../api'
import { useUiStore } from '../../../app/ui-store'
import { frameHeight, WeeklyLossChart, WeightTrendChart } from '../../../charts'
import { ChartCard, formatNumber, formatShortDate, formatSigned, isQueryLoading, QueryStateCard, SectionHeader } from '../../../components'
import { tokens } from '../../../theme'
import { MilestoneList } from './MilestoneList'
import type { RangeKey } from './range'
import { effectiveRate, forecastBandDates, forecastPath, lastTrend, milestoneList, waistPoints, weeklyLoss, weightMilestones, weightPoints } from './series'

interface WeightColumnProps {
  trend: UseQueryResult<TrendSeries, ApiError>
  range: RangeKey
  rangeLength: number
  goalKg: number
  /** The plan's start (profile), the milestones list's first row. */
  start: { date: LocalDate; kg: number } | null
}

/** "2027-04-09" → "Apr 9, 2027". */
const withYear = (date: LocalDate) => `${formatShortDate(date)}, ${date.slice(0, 4)}`
/** "2027-01-03" → "Jan 3", with the year only when it is not `year`. */
const inYear = (date: LocalDate, year: string) => (date.startsWith(year) ? formatShortDate(date) : withYear(date))
/** "2026-W40" → "40". */
const weekNumber = (date: LocalDate) => String(Number(isoWeek(date).slice(6)))

export function WeightColumn({ trend, range, rangeLength, goalKg, start }: WeightColumnProps) {
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const header = <SectionHeader title="Weight and body" subtitle="Trend, forecast, weekly loss" />
  if (!trend.data)
    return (
      <Box>
        {header}
        <Box sx={{ display: 'grid', gap: 4 }}>
          <QueryStateCard query={trend} what="the weight trend" height={frameHeight(240)} titleSize="card" />
          {isQueryLoading(trend) && <QueryStateCard query={trend} what="the weight trend" titleSize="card" />}
        </Box>
      </Box>
    )

  const data = trend.data
  const points = weightPoints(data.points)
  const last = lastTrend(data.points)
  const rate = data.forecast?.weekly_rate_kg ?? null
  const forecast =
    last && data.forecast
      ? forecastPath({ from: last, forecast: data.forecast, goalKg, horizonDays: range === 'all' ? undefined : rangeLength })
      : []
  const weighed = data.points.some((p) => p.weight_kg !== null)
  const weeks = weeklyLoss(data.points, rate)
  const chartRate = last && data.forecast ? effectiveRate(last, data.forecast, goalKg) : null
  const milestones = milestoneList(data.milestones, last, chartRate)
  const next = milestones.find((m) => m.state === 'next')
  const band = last && data.forecast ? forecastBandDates(last, data.forecast, goalKg) : null
  const bandPct = data.forecast && data.forecast.weekly_rate_kg > 0 ? Math.round((data.forecast.band.high / data.forecast.weekly_rate_kg - 1) * 100) : null
  const finish = data.forecast?.finish_date ?? null
  const year = (finish ?? band?.late ?? '').slice(0, 4)
  const whrNow = waistPoints(data.measurements).at(-1)?.whr ?? null

  return (
    <Box data-testid="progress-weight">
      {header}
      <Box sx={{ display: 'grid', gap: 4 }}>
        <ChartCard
          title="Weight trend"
          titleSize="card"
          subtitle={`Weigh-ins as dots, EWMA trend as the line${bandPct !== null ? ` · ±${bandPct} % forecast band to ${formatNumber(goalKg, 0)} kg` : ''}`}
          empty={
            weighed
              ? undefined
              : {
                  title: 'No weigh-ins in this range',
                  body: 'A morning weigh-in each day starts the trend line.',
                  action: { label: 'Log weigh-in', onClick: () => openQuickLog('weigh-in') },
                }
          }
        >
          {/* The goal line only on "All": on 4 w / 12 w it would stretch the axis to 65 kg and flatten the trend. */}
          <WeightTrendChart
            points={points}
            forecast={forecast}
            goal={range === 'all' ? goalKg : undefined}
            milestones={weightMilestones(data.milestones)}
            height={200}
          />
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 3,
              mt: '14px',
              pt: '14px',
              borderTop: `1px solid ${tokens.ink.hairline}`,
            }}
          >
            <FooterStat label="Finish" value={finish ? withYear(finish) : '—'} />
            <FooterStat label={bandPct !== null ? `Band ±${bandPct} %` : 'Forecast band'} value={band ? `${inYear(band.early, year)} – ${inYear(band.late, year)}` : '—'} />
            <FooterStat label="Next milestone" value={next ? `${next.label}${next.expectedOn ? ` · ${formatShortDate(next.expectedOn)}` : ''}` : 'All reached'} />
          </Box>
        </ChartCard>

        <ChartCard
          title="Weekly loss vs expected"
          titleSize="card"
          subtitle={rate === null ? 'Trend change per ISO week' : `Trend change per ISO week · expected ${formatSigned(-rate, 2)} kg`}
          action={
            weeks.length > 0 ? (
              <Box component="span" sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary, whiteSpace: 'nowrap' }}>
                {weeks.length === 1 ? `Week ${weekNumber(weeks[0]!.week)}` : `Weeks ${weekNumber(weeks[0]!.week)}–${weekNumber(weeks.at(-1)!.week)}`}
              </Box>
            ) : undefined
          }
          empty={weeks.length ? undefined : { title: 'No full week yet', body: 'A full Monday–Sunday week of weigh-ins draws the first bar.' }}
        >
          <WeeklyLossChart weeks={weeks} height={150} />
        </ChartCard>

        <ChartCard
          title="Milestones"
          titleSize="card"
          subtitle="Weight and composition targets with the date each was reached"
          action={
            <Button variant="text" size="tiny" component={RouterLink} to="/scans">
              Scans
            </Button>
          }
        >
          <MilestoneList items={milestones} start={start} whrNow={whrNow} />
        </ChartCard>
      </Box>
    </Box>
  )
}

/** 2a's weight-trend footer cell: a 12 px muted label over a 14/600 value (the kit's KeyStat starts at 16 px). */
function FooterStat({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0, fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.caption, color: tokens.ink.secondary }}>
      {label}
      <Box
        sx={{
          mt: '2px',
          fontSize: tokens.font.size.body,
          lineHeight: tokens.font.leading.small,
          fontWeight: tokens.font.weight.number,
          color: tokens.ink.text,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </Box>
    </Box>
  )
}
