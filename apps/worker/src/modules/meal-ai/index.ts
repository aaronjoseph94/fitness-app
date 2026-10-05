// Owns: AI on every log (SPEC §6 nutrition pipeline, §9 jobs) — the meal_analysis and day_adjustment job handlers.
// Interface:
//   registerMealAiJobs(adapters?)   registers both handlers with the job queue (the nutrition routes call it when they
//                                   mount; tests call it again with fake adapters, which replaces them)
//   MealAiAdapters                  { router, foodSources }: one LLM router and one food-sources instance per run,
//                                   both drawing on the run's shared fetch budget
// meal_analysis (a text, voice or photo meal): the router reads the meal (text; a photo meal's own photos, never any
//   other image, never Aaron's name) and returns items with grams, confidence and candidate foods; each item is matched
//   against the food sources (estimated = true with the LLM's per-100 g estimate when nothing matches); the meal moves
//   to 'review' with an ai_events 'note'. On failure the meal still moves to review with its raw text, and the job is
//   requeued (deadline, fetch budget, daily quotas) or failed (no provider answered), by the job runner.
// day_adjustment (meal confirmed, fast started): remaining kcal/macros and protein status come from the day view and
//   code (lib/numbers.ts), suggestions are favourites that fit what is left; the LLM only writes the "why" lines and the
//   note, and the card is written without them when no provider answers. Writes an ai_events 'adjustment'.
// Auto-confirm (review meals the AI is sure of, after 10 min) is the nutrition module's sweep step.
import type { Deps } from '../../lib/deps'
import { createFoodSources } from '../food-sources'
import { registerJobHandler } from '../jobs'
import { createLlmRouter } from '../llm'
import { adjustDay, DAY_ADJUSTMENT_FETCHES } from './lib/adjust'
import { analyseMeal, MEAL_ANALYSIS_FETCHES, type AnalyseAdapters } from './lib/analyse'

export type MealAiAdapters = AnalyseAdapters

const defaultAdapters: MealAiAdapters = {
  router: (deps: Deps, budget) => createLlmRouter(deps, { budget }),
  foodSources: (deps: Deps, opts) => createFoodSources(deps, opts),
}

export function registerMealAiJobs(adapters: MealAiAdapters = defaultAdapters): void {
  registerJobHandler('meal_analysis', { fetches: MEAL_ANALYSIS_FETCHES, run: (deps, job) => analyseMeal(deps, adapters, job) })
  registerJobHandler('day_adjustment', { fetches: DAY_ADJUSTMENT_FETCHES, run: (deps, job) => adjustDay(deps, adapters, job) })
}
