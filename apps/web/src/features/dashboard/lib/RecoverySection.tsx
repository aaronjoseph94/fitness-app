// Owns: the Dashboard's "Recovery and habits" section — water, steps, sleep, the fasting strip and the logging
// adherence calendar, each a panel on the dashboard board, drawn from the window's v_day rows and fasts. On a phone the
// section folds away and opens on a tap; from `md` up its panels sit in columns. The three daily panels take a third of
// a wide row each, and the strip below them takes two thirds beside the adherence calendar.
// Series mappings come from the progress module's shared entry point (../../progress/series), so these charts draw
// exactly what the Progress tab draws.
import { useUiStore } from '../../../app/ui-store'
import { CalendarHeatmap, FastingStrip, SleepChart, StepsChart, WaterChart } from '../../../charts'
import { ChartCard, formatNumber } from '../../../components'
import {
  fastEntries,
  hasAny,
  latestTargets,
  loggingAdherence,
  sleepNights,
  stepsDays,
  waterDays,
} from '../../progress/series'
import { DashboardSection, Panel } from './Section'
import type { DashboardData } from './useDashboardData'

/** SPEC §9 readiness compares sleep with 7.5 h. */
const SLEEP_TARGET_H = 7.5
/** SPEC §2: a planned fast lasts 24 h. */
const DEFAULT_FAST_HOURS = 24

export function RecoverySection({ data }: { data: DashboardData }) {
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const rows = data.days
  const targets = latestTargets(rows)
  const fastHours = data.settings?.fast_hours ?? DEFAULT_FAST_HOURS
  const water = waterDays(rows)
  const steps = stepsDays(rows)
  const sleep = sleepNights(rows)
  const entries = fastEntries(data.fasts, Date.now(), fastHours)
  // The strip runs to whichever is later: the end of the window or the last fast planned beyond it.
  const stripTo = entries.reduce((latest, f) => (f.date > latest ? f.date : latest), data.to)

  return (
    <DashboardSection
      id="recovery"
      title="Recovery and habits"
      subtitle="Water, steps, sleep and your fasts against their targets. Fast days are marked, not missed."
    >
      <Panel span={4} mdSpan={3}>
        <ChartCard
          title="Water"
          subtitle={targets ? `ml per day; target ${formatNumber(targets.water_ml)} ml` : 'ml per day'}
          testId="dashboard-water"
          empty={
            hasAny(water, (d) => d.ml)
              ? undefined
              : {
                  title: 'No water logged in this window',
                  body: 'Quick-add 250, 500 or 750 ml and the bars fill in.',
                  illustration: 'empty',
                  action: { label: 'Log water', onClick: () => openQuickLog('water') },
                }
          }
        >
          <WaterChart days={water} target={targets?.water_ml} />
        </ChartCard>
      </Panel>

      <Panel span={4} mdSpan={3}>
        <ChartCard
          title="Steps"
          subtitle={targets ? `Per day with the 14-day median; target ${formatNumber(targets.steps)}` : 'Per day with the 14-day median'}
          testId="dashboard-steps"
          empty={
            hasAny(steps, (d) => d.steps)
              ? undefined
              : { title: 'No steps in this window', body: 'Steps arrive from the Apple Watch Shortcut or the manual form.', illustration: 'empty' }
          }
        >
          <StepsChart days={steps} target={targets?.steps} />
        </ChartCard>
      </Panel>

      <Panel span={4} mdSpan={3}>
        <ChartCard
          title="Sleep"
          subtitle={`Hours asleep against ${SLEEP_TARGET_H} h, and bedtime`}
          testId="dashboard-sleep"
          empty={
            hasAny(sleep, (n) => n.hours)
              ? undefined
              : { title: 'No sleep in this window', body: 'Last night’s sleep arrives from the Apple Watch Shortcut or the manual form.', illustration: 'empty' }
          }
        >
          <SleepChart nights={sleep} target={SLEEP_TARGET_H} />
        </ChartCard>
      </Panel>

      <Panel span={8} mdSpan={3}>
        <ChartCard
          title="Fasting"
          subtitle={`Planned and completed ${fastHours} h fasts`}
          testId="dashboard-fasting"
          empty={
            entries.length > 0
              ? undefined
              : {
                  title: 'No fasts in this window',
                  body: 'A fast day is a known pattern, not a missed day. Start one from the quick-log button.',
                  illustration: 'empty',
                  action: { label: 'Start a fast', onClick: () => openQuickLog('fast') },
                }
          }
        >
          <FastingStrip fasts={entries} from={data.from} to={stripTo} />
        </ChartCard>
      </Panel>

      <Panel span={4} mdSpan={6}>
        <ChartCard
          title="Logging adherence"
          subtitle="Weigh-in, two meals or a fast, and water: share of the three"
          testId="dashboard-logging"
        >
          <CalendarHeatmap
            days={loggingAdherence(rows)}
            metric="weight"
            label="Logging adherence"
            testId="chart-logging-adherence"
            describe={(v) => (v === null ? 'No data' : v >= 1 ? 'All three logged' : `${Math.round(v * 3)} of 3 logged`)}
          />
        </ChartCard>
      </Panel>
    </DashboardSection>
  )
}
