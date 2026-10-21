// Owns: the Dashboard's nutrition cards (1d) — `MacrosCard`, the macros' daily averages as ramp bars against their
// targets (it closes the row under the KPI tiles), and `NutritionSection`, the detail section further down: calories
// per day stacked by meal slot with the target line (1.6) beside the protein-adherence calendar (1), in a row that
// wraps. Every card reads one window of v_day rows (DashboardData.days), so the section matches the Progress tab and
// the weekly report without restructuring the data.
import Box from '@mui/material/Box'
import type { DaySummary } from '@fitness/shared/schemas'
import { CalendarHeatmap, CaloriesChart } from '../../../charts'
import { ChartCard, formatNumber, MeterRow, staggerDelay, wrapCol, WrapRow } from '../../../components'
import { useUiStore } from '../../../app/ui-store'
import { tokens } from '../../../theme'
import { caloriesDays, latestTargets, proteinAdherence } from '../../progress/series'
import { DashboardSection } from './Section'
import type { DashboardData } from './useDashboardData'

/** The calories chart's plot height. */
const CALORIES_HEIGHT = 220

export function NutritionSection({ data }: { data: DashboardData }) {
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const rows = data.days
  const targets = latestTargets(rows)
  const proteinTarget = targets?.protein_g
  const noMeals = noMealsState(rows)

  // The rails are the whole point of this section: the AI may move targets, but never below these.
  const { settings } = data
  const rails = [
    targets ? `Target ${formatNumber(targets.kcal)}` : null,
    settings ? `floor ${formatNumber(settings.calorie_floor)}` : null,
    settings ? `ceiling ${formatNumber(settings.calorie_ceiling)}` : null,
  ].filter(Boolean)

  return (
    <DashboardSection
      id="nutrition"
      title="Nutrition"
      subtitle="What went in against the targets and the rails"
    >
      <WrapRow>
        <Box sx={wrapCol(1.6)}>
          <ChartCard
            fill
            title="Calories per day, by meal"
            subtitle={rails.length ? rails.join(' · ') : 'kcal per day by meal slot'}
            empty={
              noMeals
                ? { ...noMeals, action: { label: 'Log a meal', onClick: () => openQuickLog('meal') } }
                : null
            }
            testId="dashboard-calories"
          >
            <CaloriesChart days={caloriesDays(rows)} target={targets?.kcal} height={CALORIES_HEIGHT} />
          </ChartCard>
        </Box>

        <Box sx={wrapCol(1)}>
          <ChartCard
            fill
            title="Protein adherence"
            subtitle={
              proteinTarget
                ? `Share of the ${formatNumber(proteinTarget)} g target; fast days left blank`
                : 'Share of the protein target'
            }
            empty={noMeals}
            testId="dashboard-protein"
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
        </Box>
      </WrapRow>
    </DashboardSection>
  )
}

/** A window with no meals and no fast days has nothing to plot: say so instead of drawing empty axes. */
function noMealsState(rows: readonly DaySummary[]) {
  return rows.some((d) => d.meals_logged > 0 || d.is_fast_day)
    ? null
    : { title: 'No meals logged in this window', body: 'Each meal you log stacks into its slot here.' }
}

/**
 * Each macro's bar (README §2): protein and carbs and fat in their own ramps; fibre borrows the water ramp, as 1d draws
 * it. A metric's mark colour handed to `MeterRow` draws that metric's ramp on its tint track.
 */
const MACROS: readonly {
  key: 'protein_g' | 'carbs_g' | 'fat_g' | 'fibre_g'
  label: string
  color: string
  floor?: true
}[] = [
  { key: 'protein_g', label: 'Protein', color: tokens.metric.protein },
  { key: 'carbs_g', label: 'Carbs', color: tokens.metric.carbs },
  // Fat's target is a minimum (settings.fat_min_g), not an amount to land on.
  { key: 'fat_g', label: 'Fat', color: tokens.metric.fat, floor: true },
  { key: 'fibre_g', label: 'Fibre', color: tokens.metric.water },
]

/**
 * 1d's "Macros · daily average": the mean grams of each macro over the days with meals logged (fast days excluded),
 * each as a 10 px ramp bar against the latest target, the meals behind it, and how many of those days fell short of
 * the protein target.
 */
export function MacrosCard({ data }: { data: DashboardData }) {
  const rows = data.days
  const targets = latestTargets(rows)
  const empty = noMealsState(rows)
  const eaten = rows.filter((d) => d.meals_logged > 0 && !d.is_fast_day)
  const meals = eaten.reduce((sum, d) => sum + d.meals_logged, 0)
  const avg = (key: (typeof MACROS)[number]['key']) =>
    eaten.length ? eaten.reduce((sum, d) => sum + d.intake[key], 0) / eaten.length : null
  const short = eaten.filter((d) => d.targets && d.intake.protein_g < d.targets.protein_g).length
  return (
    <ChartCard
      fill
      title="Macros · daily average"
      subtitle={
        eaten.length
          ? `${formatNumber(meals)} ${meals === 1 ? 'meal' : 'meals'} over ${eaten.length} ${eaten.length === 1 ? 'day' : 'days'}${targets ? ', against the targets' : ''}`
          : targets
            ? 'Grams against the targets'
            : 'Grams per day'
      }
      empty={empty}
      caption={
        targets && eaten.length
          ? `Protein was short on ${short} of ${eaten.length} ${eaten.length === 1 ? 'day' : 'days'}.`
          : undefined
      }
      testId="dashboard-macros"
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '12px', mt: '4px' }}>
        {MACROS.map((m, i) => {
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
              delay={staggerDelay(i, 70, 600)}
              barLabel={`${m.label}: ${formatNumber(value)} of ${m.floor ? 'a minimum of ' : ''}${formatNumber(target)} g a day`}
            />
          )
        })}
      </Box>
    </ChartCard>
  )
}
