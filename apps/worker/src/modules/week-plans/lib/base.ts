// Owns: what a week looks like before anyone plans it — the starting point for replace_week_plan when the week has no
// active plan: per-weekday targets from the active plan version (override ?? default), its water and steps, the fasts
// already planned in that week, no sessions, no scan, no focus note; and a template's snapshot as a planned session.
import { Weekday, type WeekPlanContentInput, type WeekPlanSessionInput } from '@fitness/shared/schemas'
import type { Deps } from '../../../lib/deps'
import { getActivePlan } from '../../plan'
import { getTemplate } from '../../training'
import { weekFastDates } from './fasts'

export async function basePlan(deps: Deps, week_start: string): Promise<WeekPlanContentInput> {
  const [plan, fast_dates] = await Promise.all([getActivePlan(deps), weekFastDates(deps, week_start)])
  const { defaults, overrides } = plan.targets
  const day = (w: Weekday) => {
    const o = overrides[w] ?? {}
    return {
      kcal: o.kcal ?? defaults.kcal,
      protein_g: o.protein_g ?? defaults.protein_g,
      carbs_g: o.carbs_g ?? defaults.carbs_g,
      fat_g: o.fat_g ?? defaults.fat_g,
      fibre_g: o.fibre_g ?? defaults.fibre_g,
    }
  }
  return {
    targets: Object.fromEntries(Weekday.options.map((w) => [w, day(w)])) as WeekPlanContentInput['targets'],
    sessions: Object.fromEntries(Weekday.options.map((w) => [w, null])) as WeekPlanContentInput['sessions'],
    water_ml: defaults.water_ml,
    steps: defaults.steps,
    fast_dates,
    scan_date: null,
    focus_note: '',
  }
}

/** A template as a planned session (404 when there is no such template). */
export async function templateSession(deps: Deps, template_id: string): Promise<WeekPlanSessionInput> {
  const t = await getTemplate(deps, template_id)
  return { template_id: t.id, name: t.name.slice(0, 100), exercises: t.exercises.map(({ id: _id, ...e }) => e) }
}
