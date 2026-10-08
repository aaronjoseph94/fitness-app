// Owns: the Dashboard's Nutrition section (2a) — what went in against the targets and the rails, as a 1.6 : 1 : 1
// row: calories per day stacked by meal slot with the target line, the macros' daily averages as bars against their
// targets, and the protein-adherence calendar. Every card reads one window of v_day rows (DashboardData.days), so the
// section matches the Progress tab and the weekly report without restructuring the data.
import Box from '@mui/material/Box'
import type { DaySummary, TargetValues } from '@fitness/shared/schemas'
import { CalendarHeatmap, CaloriesChart } from '../../../charts'
import { ChartCard, Column, Columns, formatNumber, MeterRow } from '../../../components'
import { useUiStore } from '../../../app/ui-store'
import { tokens } from '../../../theme'
import { caloriesDays, latestTargets, proteinAdherence } from '../../progress/series'
import { DashboardSection, WIDE_ROW } from './Section'
import type { DashboardData } from './useDashboardData'

/** The calories chart's plot height: 2a's 150 px frame plus the x-axis band. */
const CALORIES_HEIGHT = 190

export function NutritionSection({ data }: { data: DashboardData }) {
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const rows = data.days
  const targets = latestTargets(rows)
  const proteinTarget = targets?.protein_g
  // A window with no meals and no fast days has nothing to plot: say so instead of drawing empty axes.
  const hasMeals = rows.some((d) => d.meals_logged > 0 || d.is_fast_day)
  const noMeals = hasMeals ? null : { title: 'No meals logged in this window', body: 'Each meal you log stacks into its slot here.' }

  // The rails are the whole point of this section: the AI may move targets, but never below these.
  const { settings } = data
  const rails = [
    targets ? `Target ${formatNumber(targets.kcal)}` : null,
    settings ? `floor ${formatNumber(settings.calorie_floor)}` : null,
    settings ? `ceiling ${formatNumber(settings.calorie_ceiling)}` : null,
  ].filter(Boolean)

  return (
    <DashboardSection id="nutrition" title="Nutrition" subtitle="What went in against the targets and the rails">
      <Columns md={2} lg={WIDE_ROW.tracks} align="stretch">
        <Column span={WIDE_ROW.wide} mdSpan={2}>
          <ChartCard
            titleSize="card"
            fill
            title="Calories per day, by meal"
            subtitle={rails.length ? rails.join(' · ') : 'kcal per day by meal slot'}
            empty={noMeals ? { ...noMeals, action: { label: 'Log a meal', onClick: () => openQuickLog('meal') } } : null}
            testId="dashboard-calories"
          >
            <CaloriesChart days={caloriesDays(rows)} target={targets?.kcal} height={CALORIES_HEIGHT} />
          </ChartCard>
        </Column>

        <Column span={WIDE_ROW.narrow} mdSpan={1}>
          <MacrosCard rows={rows} targets={targets} empty={noMeals} />
        </Column>

        <Column span={WIDE_ROW.narrow} mdSpan={1}>
          <ChartCard
            titleSize="card"
            fill
            title="Protein adherence"
            subtitle={proteinTarget ? `Share of the ${formatNumber(proteinTarget)} g target; fast days left blank` : 'Share of the protein target'}
            empty={noMeals}
            testId="dashboard-protein"
          >
            <CalendarHeatmap
              days={proteinAdherence(rows)}
              metric="protein"
              label="Protein adherence"
              testId="chart-protein-adherence"
              describe={(v) => (v === null ? 'No meals logged or a fast day' : v >= 1 ? 'At or above target' : `${Math.round(v * 100)} % of target`)}
            />
          </ChartCard>
        </Column>
      </Columns>
    </DashboardSection>
  )
}

const MACROS: readonly { key: 'protein_g' | 'carbs_g' | 'fat_g' | 'fibre_g'; label: string; color: string; floor?: true }[] = [
  { key: 'protein_g', label: 'Protein', color: tokens.metric.protein },
  { key: 'carbs_g', label: 'Carbs', color: tokens.metric.carbs },
  // Fat's target is a minimum (settings.fat_min_g), not an amount to land on.
  { key: 'fat_g', label: 'Fat', color: tokens.metric.fat, floor: true },
  // No fibre colour in the metric palette: 2a's fibre green is the success tone's solid (as on the Log tab).
  { key: 'fibre_g', label: 'Fibre', color: tokens.tone.success.solid },
]

/**
 * 2a's "Macros, daily average": the mean grams of each macro over the days with meals logged (fast days excluded),
 * each as a 6 px bar against the latest target, and how many of those days fell short of the protein target.
 */
function MacrosCard({ rows, targets, empty }: { rows: readonly DaySummary[]; targets: TargetValues | null; empty: { title: string; body: string } | null }) {
  const eaten = rows.filter((d) => d.meals_logged > 0 && !d.is_fast_day)
  const avg = (key: (typeof MACROS)[number]['key']) => (eaten.length ? eaten.reduce((sum, d) => sum + d.intake[key], 0) / eaten.length : null)
  const short = eaten.filter((d) => d.targets && d.intake.protein_g < d.targets.protein_g).length
  return (
    <ChartCard
      titleSize="card"
      fill
      title="Macros, daily average"
      subtitle={targets ? 'Grams against the targets' : 'Grams per day'}
      empty={empty}
      caption={targets && eaten.length ? `Protein was short on ${short} of ${eaten.length} ${eaten.length === 1 ? 'day' : 'days'}.` : undefined}
      testId="dashboard-macros"
    >
      <Box sx={{ display: 'grid', gap: 3 }}>
        {MACROS.map((m) => {
          const value = avg(m.key)
          const target = targets?.[m.key] ?? null
          return (
            <MeterRow
              key={m.key}
              label={m.label}
              value={value}
              target={target}
              unit="g"
              floor={m.floor}
              color={m.color}
              barLabel={`${m.label}: ${formatNumber(value)} of ${m.floor ? 'a minimum of ' : ''}${formatNumber(target)} g a day`}
            />
          )
        })}
      </Box>
    </ChartCard>
  )
}
