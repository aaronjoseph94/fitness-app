// Owns: one meal_analysis run — read the meal (text, and for a photo meal its own photos from R2), ask the router for
// the items, match each against the food sources (one instance per run, sharing the run's fetch budget), and hand the
// items to the nutrition module, which stores them only if the meal is still waiting. A failed run leaves the meal in
// review with its raw text (Aaron adds items himself) and rethrows, so the job runner requeues the job (deadline, fetch
// budget, daily quotas) or fails it (no provider answered: JobFailed).
import { MealAnalysisOutput, type Nutrients } from '@fitness/shared/schemas'
import type { Deps } from '../../../lib/deps'
import { eventInsert } from '../../events'
import { nutritionFor, type FoodSources, type SharedBudget } from '../../food-sources'
import { JobFailed, type JobContext, type JobMeta } from '../../jobs'
import { ProvidersExhaustedError, type ImageInput, type LlmRouter } from '../../llm'
import { analysisInput, applyAnalysis, releaseForReview, type AnalysedItem } from '../../nutrition'
import { MEAL_ANALYSIS_SYSTEM, mealAnalysisMessage } from './prompts'

/** Subrequests one run may make: the router (failover, one retry and one repair per model) and food lookups share it. */
export const MEAL_ANALYSIS_FETCHES = 24
/** Food lookups may use at most this many of them. */
const FOOD_CALLS = 12
/** Photos sent per meal (each ~100–300 KB at 1,024 px). */
const MAX_PHOTOS = 4
/** The LLM call's own deadline: photos take longer. The job's whole deadline is 25 s. */
const LLM_DEADLINE_MS = { photo: 16_000, text: 12_000 }
/** No remote food lookup starts later than this after the run began (cache-only after). */
const MATCH_WINDOW_MS = 21_000
/** An LLM estimate is a guess: its item never counts as sure enough to auto-confirm. */
const ESTIMATE_CONFIDENCE_CAP = 0.6

export interface AnalyseAdapters {
  router: (deps: Deps, budget: SharedBudget) => Pick<LlmRouter, 'complete'>
  foodSources: (deps: Deps, opts: { budget: SharedBudget; maxExternalCalls: number; until: number }) => FoodSources
}

type Output = { output: MealAnalysisOutput; meta?: JobMeta }

const ZERO: Nutrients = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0 }
const round3 = (x: number) => Math.round(x * 1000) / 1000
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const skipped = (notes: string): Output => ({ output: { items: [], notes } })

export async function analyseMeal(deps: Deps, adapters: AnalyseAdapters, job: JobContext<'meal_analysis'>): Promise<Output> {
  const input = await analysisInput(deps, job.payload.meal_id)
  if (!input) return skipped('The meal was deleted before it was analysed.')
  const { meal, photos } = input
  if (meal.status === 'confirmed' || (meal.status === 'review' && meal.item_count > 0)) return skipped('The meal already has items.')
  const text = meal.raw_text?.trim() || null
  const shown = meal.input_method === 'photo' ? photos.slice(0, MAX_PHOTOS) : []

  try {
    const images = await readPhotos(deps, shown)
    if (!text && images.length === 0) {
      await releaseForReview(deps, meal.id)
      return skipped('Nothing to analyse yet: no text and no photo.')
    }
    const started = deps.now().getTime()
    const budget: SharedBudget = { limit: MEAL_ANALYSIS_FETCHES, used: 0 }
    const res = await adapters.router(deps, budget).complete({
      job: 'meal_analysis',
      system: MEAL_ANALYSIS_SYSTEM,
      messages: [{ role: 'user', content: mealAnalysisMessage(meal.slot, text, images.length) }],
      ...(images.length ? { images } : {}),
      schema: MealAnalysisOutput,
      priority: 'user',
      deadlineMs: images.length ? LLM_DEADLINE_MS.photo : LLM_DEADLINE_MS.text,
      maxTokens: 2048,
    })

    const foods = adapters.foodSources(deps, { budget, maxExternalCalls: FOOD_CALLS, until: started + MATCH_WINDOW_MS })
    const items = await Promise.all(res.data.items.map((item) => toItem(foods, item)))
    const summary = noteText(meal.slot, items)
    const note = eventInsert(deps, {
      kind: 'note',
      summary,
      body: { text: res.data.notes ? `${summary} ${res.data.notes}` : summary, meal_id: meal.id },
      date: meal.date,
      job_id: job.id,
    })
    await applyAnalysis(deps, meal.id, { items, photo_ids: photos.map((p) => p.id) }, [note.statement])
    return {
      output: res.data,
      meta: { provider: res.provider, model: res.model, tokens_in: res.tokens_in, tokens_out: res.tokens_out },
    }
  } catch (e) {
    // Aaron is never left waiting on a spinner: the meal shows its raw text in review. A requeued run (deadline, fetch
    // budget, daily quotas) still fills it in if he has not added items by then; when no provider could answer at all,
    // the job fails now rather than retrying behind his back.
    await releaseForReview(deps, meal.id).catch(() => undefined)
    if (e instanceof ProvidersExhaustedError && !e.quotaOnly) throw new JobFailed(e.message)
    throw e
  }
}

/** The meal's photos from R2 (a missing object is skipped). Keys come from analysisInput: this meal's photos only. */
async function readPhotos(deps: Deps, photos: { key: string; mime: string }[]): Promise<ImageInput[]> {
  const objects = await Promise.all(photos.map((p) => deps.env.FILES.get(p.key)))
  const out: ImageInput[] = []
  for (const [i, o] of objects.entries()) if (o) out.push({ mime: photos[i]!.mime, data: await o.arrayBuffer() })
  return out
}

/**
 * One analysed item → a meal item. A database match gives the food, its nutrition at the item's grams and
 * confidence = min(LLM confidence, match score). No match: the LLM's per-100 g estimate × grams / 100, estimated = true,
 * confidence = min(LLM confidence, 0.6); no estimate either → 0 kcal and confidence 0 (Aaron fills it in).
 */
async function toItem(foods: FoodSources, item: MealAnalysisOutput['items'][number]): Promise<AnalysedItem> {
  const description = capitalise(item.name.trim())
  const match = await foods.matchItem({ name: item.name, grams: item.grams, candidates: item.candidates })
  if (match)
    return {
      description,
      grams: item.grams,
      food_id: match.food.id,
      nutrients: match.nutrients,
      confidence: round3(Math.min(item.confidence, match.confidence)),
      estimated: false,
    }
  const e = item.estimate
  return {
    description,
    grams: item.grams,
    food_id: null,
    nutrients: e
      ? nutritionFor({ kcal_per_100g: e.kcal, protein_g: e.protein_g, carbs_g: e.carbs_g, fat_g: e.fat_g, fibre_g: e.fibre_g }, item.grams)
      : ZERO,
    confidence: e ? round3(Math.min(item.confidence, ESTIMATE_CONFIDENCE_CAP)) : 0,
    estimated: true,
  }
}

/** "Lunch: 3 items, about 640 kcal (1 estimated). Check and confirm." */
function noteText(slot: string, items: AnalysedItem[]): string {
  const name = capitalise(slot)
  if (items.length === 0) return `${name}: no foods recognised. Add the items yourself.`
  const kcal = Math.round(items.reduce((sum, i) => sum + i.nutrients.kcal, 0))
  const estimated = items.filter((i) => i.estimated).length
  return `${name}: ${items.length} item${items.length > 1 ? 's' : ''}, about ${kcal} kcal${estimated ? ` (${estimated} estimated)` : ''}. Check and confirm.`
}
