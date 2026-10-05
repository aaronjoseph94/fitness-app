// Owns: what the weekly_review model reads — the system prompt (the rails and how to write the review) and one compact
// JSON user message built from the engine's metrics, the rails, the active targets and next week's planned fasts.
// Privacy (SPEC §9): no name, no photos, nothing but aggregates and exercise names.
import { addDays } from '@fitness/shared/engine'
import type { PlanTargets, Rails, WeeklyMetrics } from '@fitness/shared/schemas'

export const SYSTEM_PROMPT = `You write the weekly review for a single-user fat-loss and strength tracker. The user is a 31-year-old man, 165 cm, working with his doctor and dietitian towards a 65 kg goal. You get the engine's computed metrics for one Monday-Sunday week, the rails and the current plan targets. The engine has already done every calculation; you read it and coach.

Write in plain, direct English, second person ("you"), no hype, no medical claims. Quote numbers only from the input; never invent data. Units: kg, kcal, g, ml.

Return JSON with:
- narrative: 3 to 6 short sentences. What happened (trend change, intake vs target, protein, training and volume, fasts, water, steps, sleep), what it means for the goal, and the one focus for next week. Mention every flag in the input.
- highlights: up to 5 short items that went well.
- concerns: up to 5 short items to watch (every flag in the input is a concern).
- proposals: at most 3 plan changes {field, weekday, from, to, reason}. weekday null means every day. from is the current value in plan_targets. Daily kcal stays between rails.calorie_floor and rails.calorie_ceiling; protein_g never below rails.protein_min_g; fat_g never below rails.fat_min_g. Never propose fewer calories because of a plateau; suggest talking to the dietitian instead. Propose nothing when the week does not call for a change.
- week_plan for next_week_start: targets per weekday copied from plan_targets (an override replaces the default) with your proposals applied; every session null (training is planned separately); water_ml and steps from plan_targets; fast_dates exactly next_week_planned_fasts; scan_date null; focus_note one or two sentences.`

/** The user message: one JSON object (ids and precise floats stripped to keep it small). */
export function reviewMessage(input: {
  metrics: WeeklyMetrics
  rails: Rails
  targets: PlanTargets
  goal: { weight_kg: number; date: string }
  next_week_planned_fasts: string[]
}): string {
  const { metrics: m } = input
  return JSON.stringify({
    week: m.week,
    week_start: m.week_start,
    next_week_start: addDays(m.week_start, 7),
    goal: input.goal,
    rails: input.rails,
    plan_targets: input.targets,
    next_week_planned_fasts: input.next_week_planned_fasts,
    metrics: {
      trend_start_kg: m.trend_start_kg,
      trend_end_kg: m.trend_end_kg,
      trend_change_kg: m.trend_change_kg,
      intake_avg: m.intake_avg,
      target_kcal_avg: m.target_kcal_avg,
      target_protein_g: m.target_protein_g,
      days_logged: m.days_logged,
      protein_adherence: m.protein_adherence,
      water_avg_ml: m.water_avg_ml,
      steps_avg: m.steps_avg,
      sleep_avg_min: m.sleep_avg_min,
      sessions_done: m.sessions_done,
      sessions_planned: m.sessions_planned,
      muscle_scores: m.muscle_scores,
      volume_kg: m.volume_kg,
      prs: m.prs.map((p) => ({ exercise: p.exercise_name, kind: p.kind, reps: p.reps, load_kg: p.load_kg, previous_best_kg: p.previous_best_kg })),
      fasts: m.fasts.map((f) => ({ hours: f.hours, status: f.status })),
      logging_adherence: m.logging_adherence,
      forecast: m.forecast,
      flags: m.flags,
      scan: m.scan && {
        date: m.scan.date,
        previous_date: m.scan.previous_date,
        fat_vs_lean: m.scan.fat_vs_lean,
        body_fat_pct: m.scan.body_fat_pct,
        visceral_fat_level: m.scan.visceral_fat_level,
        lean_loss: m.scan.lean_loss,
        milestones_reached: m.scan.milestones_reached,
      },
    },
  })
}
