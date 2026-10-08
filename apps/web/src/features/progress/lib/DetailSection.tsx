// Owns: the measurements and adherence section of Progress — the charts 2a's two columns leave out: waist and WHR
// from the tape (GET /api/trend measurements), the progress photos card, the protein and logging adherence calendars,
// and the full water (bars + target), steps (bars + 14-day median) and sleep (bars + bedtime) charts that the habits
// column's mini cards summarise (the range's v_day rows).
import Box from '@mui/material/Box'
import type { DaySummary, TrendSeries } from '@fitness/shared/schemas'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ApiError } from '../../../api'
import { useUiStore } from '../../../app/ui-store'
import { CalendarHeatmap, SleepChart, StepsChart, WaistWhrChart, WaterChart } from '../../../charts'
import { ChartCard, Column, Columns, formatNumber, SectionHeader } from '../../../components'
import { PhotosLink } from '../../photos'
import { hasAny, latestTargets, loggingAdherence, proteinAdherence, SLEEP_TARGET_H, sleepNights, stepsDays, waistPoints, waterDays } from './series'

/** SPEC §3: waist-to-hip ratio under 0.90. */
const WHR_TARGET = 0.9

interface DetailSectionProps {
  trend: UseQueryResult<TrendSeries, ApiError>
  days: UseQueryResult<DaySummary[], ApiError>
}

export function DetailSection({ trend, days }: DetailSectionProps) {
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const waist = trend.data ? waistPoints(trend.data.measurements) : null
  const rows = days.data ?? null
  const meals = rows?.some((d) => d.meals_logged > 0 || d.is_fast_day) ?? false
  const targets = rows ? latestTargets(rows) : null
  const proteinTarget = targets?.protein_g
  const water = rows ? waterDays(rows) : []
  const steps = rows ? stepsDays(rows) : []
  const sleep = rows ? sleepNights(rows) : []

  return (
    <Box component="section" aria-labelledby="progress-detail-title">
      <SectionHeader id="progress-detail" title="Measurements and adherence" subtitle="Tape, photos, water, steps, sleep and the daily calendars" />
      <Columns md={2}>
        <Column>
          <Box sx={{ display: 'grid', gap: 4 }}>
            {waist && (
              <ChartCard
                title="Waist and WHR"
                titleSize="card"
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
                titleSize="card"
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
              <ChartCard title="Logging adherence" titleSize="card" subtitle="Weigh-in, two meals or a fast, and water: share of the three">
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
      {rows && (
        <Box sx={{ mt: 4 }}>
          {/* The three cards fill their row, so it ends level whatever each chart's height. */}
          <Columns md={3} align="stretch">
            <Column>
              <ChartCard
                title="Water"
                titleSize="card"
                fill
                subtitle={targets ? `ml per day; target ${formatNumber(targets.water_ml)} ml` : 'ml per day'}
                empty={
                  hasAny(water, (d) => d.ml)
                    ? undefined
                    : {
                        title: 'No water logged in this range',
                        body: 'Quick-add 250, 500 or 750 ml and the bars fill in.',
                        action: { label: 'Log water', onClick: () => openQuickLog('water') },
                      }
                }
              >
                <WaterChart days={water} target={targets?.water_ml} />
              </ChartCard>
            </Column>
            <Column>
              <ChartCard
                title="Steps"
                titleSize="card"
                fill
                subtitle={targets ? `Per day with the 14-day median; target ${formatNumber(targets.steps)}` : 'Per day with the 14-day median'}
                empty={
                  hasAny(steps, (d) => d.steps)
                    ? undefined
                    : { title: 'No steps in this range', body: 'Steps arrive from the Apple Watch Shortcut or the manual form.' }
                }
              >
                <StepsChart days={steps} target={targets?.steps} />
              </ChartCard>
            </Column>
            <Column>
              <ChartCard
                title="Sleep"
                titleSize="card"
                fill
                subtitle={`Hours asleep against ${SLEEP_TARGET_H} h, and bedtime`}
                empty={
                  hasAny(sleep, (n) => n.hours)
                    ? undefined
                    : { title: 'No sleep in this range', body: 'Last night’s sleep arrives from the Apple Watch Shortcut or the manual form.' }
                }
              >
                <SleepChart nights={sleep} target={SLEEP_TARGET_H} />
              </ChartCard>
            </Column>
          </Columns>
        </Box>
      )}
    </Box>
  )
}
