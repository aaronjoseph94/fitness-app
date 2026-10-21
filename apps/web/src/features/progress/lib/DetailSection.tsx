// Owns: the measurements and adherence section of Progress — the charts 1d's opening rows leave out: waist and WHR
// from the tape (GET /api/trend measurements), the progress photos card, the fasting strip (GET /api/fasts), the
// protein and logging adherence calendars, and the full water (bars + target), steps (bars + 14-day median) and sleep
// (bars + bedtime) charts that the small habit cards summarise (the range's v_day rows). Rows of cards wrap
// (README §4).
import Box from '@mui/material/Box'
import type { DaySummary, Fast, LocalDate, TrendSeries } from '@fitness/shared/schemas'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ApiError } from '../../../api'
import { useUiStore } from '../../../app/ui-store'
import {
  CalendarHeatmap,
  FastingStrip,
  SleepChart,
  StepsChart,
  WaistWhrChart,
  WaterChart,
} from '../../../charts'
import { ChartCard, formatNumber, QueryStateCard, SectionHeader, wrapCol, WrapRow } from '../../../components'
import { tokens } from '../../../theme'
import { PhotosLink } from '../../photos'
import {
  fastEntries,
  hasAny,
  latestTargets,
  loggingAdherence,
  proteinAdherence,
  SLEEP_TARGET_H,
  sleepNights,
  stepsDays,
  waistPoints,
  waterDays,
} from './series'

/** SPEC §3: waist-to-hip ratio under 0.90. */
const WHR_TARGET = 0.9

const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four']

interface DetailSectionProps {
  trend: UseQueryResult<TrendSeries, ApiError>
  days: UseQueryResult<DaySummary[], ApiError>
  fasts: UseQueryResult<Fast[], ApiError>
  from: LocalDate
  to: LocalDate
  fastHours: number
  /** Fasts a month from settings; null while settings load. */
  fastsPerMonth: number | null
}

/** A single-column stack of cards, 26 px apart (README §4: a grid stack declares its one track). */
const stack = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: `${tokens.rhythm.section}px`,
} as const

export function DetailSection({
  trend,
  days,
  fasts,
  from,
  to,
  fastHours,
  fastsPerMonth,
}: DetailSectionProps) {
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const waist = trend.data ? waistPoints(trend.data.measurements) : null
  const rows = days.data ?? null
  const meals = rows?.some((d) => d.meals_logged > 0 || d.is_fast_day) ?? false
  const targets = rows ? latestTargets(rows) : null
  const proteinTarget = targets?.protein_g
  const water = rows ? waterDays(rows) : []
  const steps = rows ? stepsDays(rows) : []
  const sleep = rows ? sleepNights(rows) : []
  const entries = fasts.data ? fastEntries(fasts.data, Date.now(), fastHours) : []
  const stripTo = entries.reduce((latest, f) => (f.date > latest ? f.date : latest), to)
  const fastsLine =
    fastsPerMonth === null
      ? `${fastHours} h fasts`
      : `${COUNT_WORDS[fastsPerMonth] ?? fastsPerMonth} ${fastHours} h fasts a month`

  return (
    <Box
      component="section"
      aria-labelledby="progress-detail-title"
      sx={{ mt: `${40 - tokens.rhythm.section}px` }}
    >
      <SectionHeader
        id="progress-detail"
        title="Measurements and adherence"
        subtitle="Tape, photos, fasting, water, steps, sleep and the daily calendars"
      />
      <Box sx={stack}>
        <WrapRow>
          <Box sx={wrapCol(1)}>
            <Box sx={stack}>
              {waist && (
                <ChartCard
                  title="Waist and WHR"
                  titleSize="card"
                  subtitle="Waist at the navel and the waist-to-hip ratio"
                  empty={
                    waist.length
                      ? undefined
                      : {
                          title: 'No tape measurements in this range',
                          body: 'Measure waist and hips once a week and both lines start here.',
                        }
                  }
                >
                  <WaistWhrChart points={waist} whrTarget={WHR_TARGET} />
                </ChartCard>
              )}
              <PhotosLink />
              {!fasts.data ? (
                <QueryStateCard query={fasts} what="your fasts" height={90} titleSize="card" />
              ) : (
                <ChartCard
                  title="Fasting"
                  titleSize="card"
                  subtitle={`${fastsLine} · planned, done, partial, missed`}
                >
                  <FastingStrip fasts={entries} from={from} to={stripTo} />
                </ChartCard>
              )}
            </Box>
          </Box>
          <Box sx={wrapCol(1)}>
            {rows && (
              <Box sx={stack}>
                <ChartCard
                  title="Protein adherence"
                  titleSize="card"
                  subtitle={
                    proteinTarget
                      ? `Share of the ${formatNumber(proteinTarget)} g target; fast days left blank`
                      : 'Share of the protein target'
                  }
                  empty={meals ? undefined : { title: 'No meals logged in this range' }}
                >
                  <CalendarHeatmap
                    days={proteinAdherence(rows)}
                    metric="protein"
                    label="Protein adherence"
                    testId="chart-protein-adherence"
                    describe={(v) =>
                      v === null
                        ? 'No meals logged or a fast day'
                        : v >= 1
                          ? 'At or above target'
                          : `${Math.round(v * 100)} % of target`
                    }
                  />
                </ChartCard>
                <ChartCard
                  title="Logging adherence"
                  titleSize="card"
                  subtitle="Weigh-in, two meals or a fast, and water: share of the three"
                >
                  <CalendarHeatmap
                    days={loggingAdherence(rows)}
                    metric="weight"
                    label="Logging adherence"
                    testId="chart-logging-adherence"
                    describe={(v) =>
                      v === null
                        ? 'No data'
                        : v >= 1
                          ? 'All three logged'
                          : `${Math.round(v * 3)} of 3 logged`
                    }
                  />
                </ChartCard>
              </Box>
            )}
          </Box>
        </WrapRow>
        {rows && (
          // The three cards fill their row, so it ends level whatever each chart's height; the row wraps.
          <WrapRow>
            <Box sx={wrapCol(1)}>
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
            </Box>
            <Box sx={wrapCol(1)}>
              <ChartCard
                title="Steps"
                titleSize="card"
                fill
                subtitle={
                  targets
                    ? `Per day with the 14-day median; target ${formatNumber(targets.steps)}`
                    : 'Per day with the 14-day median'
                }
                empty={
                  hasAny(steps, (d) => d.steps)
                    ? undefined
                    : {
                        title: 'No steps in this range',
                        body: 'Steps arrive from the Apple Watch Shortcut or the manual form.',
                      }
                }
              >
                <StepsChart days={steps} target={targets?.steps} />
              </ChartCard>
            </Box>
            <Box sx={wrapCol(1)}>
              <ChartCard
                title="Sleep"
                titleSize="card"
                fill
                subtitle={`Hours asleep against ${SLEEP_TARGET_H} h, and bedtime`}
                empty={
                  hasAny(sleep, (n) => n.hours)
                    ? undefined
                    : {
                        title: 'No sleep in this range',
                        body: 'Last night’s sleep arrives from the Apple Watch Shortcut or the manual form.',
                      }
                }
              >
                <SleepChart nights={sleep} target={SLEEP_TARGET_H} />
              </ChartCard>
            </Box>
          </WrapRow>
        )}
      </Box>
    </Box>
  )
}
