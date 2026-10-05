// Owns: the charts section of the styleguide — every chart in SPEC §11's inventory with sample data, in the
// ChartCard it will live in, plus one chart at the fixed print width on wide screens.
import Box from '@mui/material/Box'
import useMediaQuery from '@mui/material/useMediaQuery'
import {
  BodyCompositionChart,
  BodyFatVisceralChart,
  CalendarHeatmap,
  CaloriesChart,
  FastingStrip,
  Gauge,
  MacrosChart,
  MilestoneTimeline,
  SegmentalFatChart,
  SleepChart,
  StepsChart,
  StrengthChart,
  TrainingVolumeChart,
  WaistWhrChart,
  WaterChart,
  WeekPlanVsActualChart,
  WeeklyLossChart,
  WeightTrendChart,
} from '../../../charts'
import { sample } from '../../../charts/sample-data'
import { ChartCard } from '../../../components'
import { tokens } from '../../../theme'
import { Caption, Grid, Section } from './layout'

const t = sample.targets

export function ChartsSection() {
  const wide = useMediaQuery('(min-width: 800px)')
  return (
    <Section
      id="charts"
      title="Charts"
      subtitle={`Gridlines ${tokens.chart.grid} only, ${tokens.chart.lineWidth} px lines, ${tokens.chart.areaOpacity * 100} % fills, ${tokens.chart.barRadius} px bar tops, dashed grey targets. Tap any chart for values.`}
    >
      <Box sx={{ display: 'grid', gap: 4 }}>
        <ChartCard title="Weight trend" subtitle={`Trend, weigh-ins and forecast to ${t.goalKg} kg`}>
          <WeightTrendChart {...sample.weight} />
        </ChartCard>

        <Grid min={380}>
          <ChartCard title="Weekly loss vs expected" subtitle="Trend change per week">
            <WeeklyLossChart weeks={sample.weeklyLoss} />
          </ChartCard>
          <ChartCard title="Milestones" subtitle="Reached and forecast">
            <MilestoneTimeline milestones={sample.milestones} />
          </ChartCard>
          <ChartCard title="Calories vs target" subtitle="Last 28 days by meal slot">
            <CaloriesChart days={sample.calories} target={t.kcal} />
          </ChartCard>
          <ChartCard title="Macros" subtitle="Grams per day">
            <MacrosChart days={sample.macros} proteinTarget={t.proteinG} />
          </ChartCard>
          <ChartCard title="Protein adherence" subtitle="Days at or above 130 g">
            <CalendarHeatmap
              days={sample.proteinAdherence}
              metric="protein"
              mode="binary"
              label="Protein adherence"
              testId="chart-protein-adherence"
            />
          </ChartCard>
          <ChartCard title="Logging adherence" subtitle="Weigh-in, meals and water logged">
            <CalendarHeatmap
              days={sample.loggingAdherence}
              metric="weight"
              label="Logging adherence"
              testId="chart-logging-adherence"
            />
          </ChartCard>
          <ChartCard title="Water" subtitle="Millilitres per day">
            <WaterChart days={sample.water} target={t.waterMl} />
          </ChartCard>
          <ChartCard title="Steps" subtitle="Per day, with the 14-day median">
            <StepsChart days={sample.steps} />
          </ChartCard>
          <ChartCard title="Sleep" subtitle="Hours asleep and bedtime">
            <SleepChart nights={sample.sleep} target={t.sleepH} />
          </ChartCard>
          <ChartCard title="Fasting" subtitle="Two 24 h fasts a month">
            <FastingStrip fasts={sample.fasts} from={sample.fastingRange.from} to={sample.fastingRange.to} />
          </ChartCard>
          <ChartCard title="Body composition" subtitle="Fat and lean mass per scan">
            <BodyCompositionChart scans={sample.scans} fatTarget={t.fatTargetKg} />
          </ChartCard>
          <ChartCard title="Body fat and visceral level" subtitle="Per scan">
            <BodyFatVisceralChart
              scans={sample.scans}
              bodyFatTarget={t.bodyFatTargetPct}
              visceralTarget={t.visceralTarget}
            />
          </ChartCard>
          <ChartCard title="Latest scan" subtitle="2026-11-21 against the Evolt ranges">
            <Box
              sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 4 }}
            >
              <Gauge
                {...sample.gauges.bodyFat}
                label="Body fat"
                unit="%"
                precision={1}
                size={170}
                testId="chart-gauge-body-fat"
              />
              <Gauge
                {...sample.gauges.visceral}
                label="Visceral level"
                size={170}
                testId="chart-gauge-visceral"
              />
            </Box>
          </ChartCard>
          <ChartCard title="Segmental fat" subtitle="Baseline vs latest scan, kg">
            <SegmentalFatChart
              segments={sample.segments}
              baselineLabel="2026-09-26"
              latestLabel="2026-11-21"
            />
          </ChartCard>
          <ChartCard title="Waist and WHR" subtitle="Weekly tape measurements">
            <WaistWhrChart points={sample.waist} whrTarget={t.whrTarget} />
          </ChartCard>
          <ChartCard title="Training volume" subtitle="Per week by muscle group">
            <TrainingVolumeChart weeks={sample.volume} groups={sample.volumeGroups} />
          </ChartCard>
          <ChartCard title={sample.strength.exercise} subtitle="Top set and estimated 1RM">
            <StrengthChart sessions={sample.strength.sessions} />
          </ChartCard>
          <ChartCard title="This week: plan vs actual" subtitle="Calories per day and Mon–Thu sessions">
            <WeekPlanVsActualChart days={sample.weekPlan} />
          </ChartCard>
          <ChartCard
            title="Empty chart card"
            empty={{
              title: 'No scans yet',
              body: 'Upload your Evolt sheet and the composition charts start here.',
              illustration: 'progress',
            }}
          />
        </Grid>

        {wide ? (
          <Box>
            <Caption sx={{ mb: 2 }}>
              Print width (700 px, no animation): what the weekly report and its PDF render.
            </Caption>
            <ChartCard title="Weight trend · print">
              <WeightTrendChart {...sample.weight} width={700} />
            </ChartCard>
          </Box>
        ) : (
          <Caption>Print-width preview (700 px) shows on screens 800 px and wider.</Caption>
        )}
      </Box>
    </Section>
  )
}
