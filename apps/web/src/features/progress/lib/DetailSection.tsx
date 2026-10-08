// Owns: the measurements and adherence section of Progress — the charts 2a's two columns leave out: waist and WHR
// from the tape (GET /api/trend measurements), the progress photos card, and the protein and logging adherence
// calendars (the range's v_day rows).
import Box from '@mui/material/Box'
import type { DaySummary, TrendSeries } from '@fitness/shared/schemas'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ApiError } from '../../../api'
import { CalendarHeatmap, WaistWhrChart } from '../../../charts'
import { ChartCard, Column, Columns, formatNumber, SectionHeader } from '../../../components'
import { PhotosLink } from '../../photos'
import { latestTargets, loggingAdherence, proteinAdherence, waistPoints } from './series'

/** SPEC §3: waist-to-hip ratio under 0.90. */
const WHR_TARGET = 0.9

interface DetailSectionProps {
  trend: UseQueryResult<TrendSeries, ApiError>
  days: UseQueryResult<DaySummary[], ApiError>
}

export function DetailSection({ trend, days }: DetailSectionProps) {
  const waist = trend.data ? waistPoints(trend.data.measurements) : null
  const rows = days.data ?? null
  const meals = rows?.some((d) => d.meals_logged > 0 || d.is_fast_day) ?? false
  const proteinTarget = rows ? latestTargets(rows)?.protein_g : undefined

  return (
    <Box component="section" aria-labelledby="progress-detail-title">
      <SectionHeader id="progress-detail" title="Measurements and adherence" subtitle="Tape, photos and the daily calendars" />
      <Columns md={2}>
        <Column>
          <Box sx={{ display: 'grid', gap: 4 }}>
            {waist && (
              <ChartCard
                title="Waist and WHR"
                subtitle="Waist at the navel and the waist-to-hip ratio"
                empty={
                  waist.length
                    ? undefined
                    : { title: 'No tape measurements in this range', body: 'Measure waist and hips once a week and both lines start here.' }
                }
              >
                <WaistWhrChart points={waist} whrTarget={WHR_TARGET} />
              </ChartCard>
            )}
            <PhotosLink />
          </Box>
        </Column>
        <Column>
          {rows && (
            <Box sx={{ display: 'grid', gap: 4 }}>
              <ChartCard
                title="Protein adherence"
                subtitle={proteinTarget ? `Share of the ${formatNumber(proteinTarget)} g target; fast days left blank` : 'Share of the protein target'}
                empty={meals ? undefined : { title: 'No meals logged in this range' }}
              >
                <CalendarHeatmap
                  days={proteinAdherence(rows)}
                  metric="protein"
                  label="Protein adherence"
                  testId="chart-protein-adherence"
                  describe={(v) => (v === null ? 'No meals logged or a fast day' : v >= 1 ? 'At or above target' : `${Math.round(v * 100)} % of target`)}
                />
              </ChartCard>
              <ChartCard title="Logging adherence" subtitle="Weigh-in, two meals or a fast, and water: share of the three">
                <CalendarHeatmap
                  days={loggingAdherence(rows)}
                  metric="weight"
                  label="Logging adherence"
                  testId="chart-logging-adherence"
                  describe={(v) => (v === null ? 'No data' : v >= 1 ? 'All three logged' : `${Math.round(v * 3)} of 3 logged`)}
                />
              </ChartCard>
            </Box>
          )}
        </Column>
      </Columns>
    </Box>
  )
}
