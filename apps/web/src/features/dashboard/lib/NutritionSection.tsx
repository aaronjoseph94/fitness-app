// Owns: the Dashboard's Nutrition section — what went in against the targets and the rails: calories per day by meal
// slot with the target line, macros in grams with the protein target, and a protein-adherence calendar. Every panel
// reads one window of v_day rows (DashboardData.days), so the section matches the Progress tab and the weekly report
// without restructuring the data.
import { CalendarHeatmap, CaloriesChart, MacrosChart } from '../../../charts'
import { ChartCard, formatNumber } from '../../../components'
import { useUiStore } from '../../../app/ui-store'
import { caloriesDays, latestTargets, macrosDays, proteinAdherence } from '../../progress/series'
import { DashboardSection, Panel } from './Section'
import type { DashboardData } from './useDashboardData'

export function NutritionSection({ data }: { data: DashboardData }) {
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const rows = data.days
  const targets = latestTargets(rows)
  const proteinTarget = targets?.protein_g
  // A window with no meals and no fast days has nothing to plot: say so instead of drawing empty axes.
  const hasMeals = rows.some((d) => d.meals_logged > 0 || d.is_fast_day)
  const noMeals = hasMeals
    ? undefined
    : { title: 'No meals logged in this window', body: 'Each meal you log stacks into its slot here.', illustration: 'meals' as const }

  // The rails are the whole point of this section: the AI may move targets, but never below these.
  const { settings } = data
  const rails = settings
    ? `Rails: ${formatNumber(settings.calorie_floor)}–${formatNumber(settings.calorie_ceiling)} kcal, protein ${formatNumber(settings.protein_min_g)} g min, fat ${formatNumber(settings.fat_min_g)} g min`
    : null

  return (
    <DashboardSection
      id="nutrition"
      title="Nutrition"
      subtitle={rails ? `Intake against the targets, inside the rails. ${rails}.` : 'Intake against the targets.'}
    >
      {/* The intake chart runs the full width — it is the one chart here whose density (a bar per day) rewards the room —
          and the two under it halve the row. The adherence calendar is deliberately the narrower of the two: its cells
          stop growing at 22 px, so a wide card would be a small calendar in a mostly empty box. */}
      <Panel span={12} mdSpan={6}>
        <ChartCard
          title="Calories vs target"
          subtitle={targets ? `kcal per day by meal slot; target ${formatNumber(targets.kcal)} kcal` : 'kcal per day by meal slot'}
          empty={noMeals ? { ...noMeals, action: { label: 'Log a meal', onClick: () => openQuickLog('meal') } } : undefined}
          testId="dashboard-calories"
        >
          <CaloriesChart days={caloriesDays(rows)} target={targets?.kcal} />
        </ChartCard>
      </Panel>

      <Panel span={7} mdSpan={3}>
        <ChartCard
          title="Macros"
          subtitle={proteinTarget ? `Grams per day; protein target ${formatNumber(proteinTarget)} g` : 'Grams per day'}
          empty={noMeals}
          testId="dashboard-macros"
        >
          <MacrosChart days={macrosDays(rows)} proteinTarget={proteinTarget} />
        </ChartCard>
      </Panel>

      <Panel span={5} mdSpan={3}>
        <ChartCard
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
            describe={(v) => (v === null ? 'No meals logged or a fast day' : v >= 1 ? 'At or above target' : `${Math.round(v * 100)} % of target`)}
          />
        </ChartCard>
      </Panel>
    </DashboardSection>
  )
}
