// Owns: what the Clerk (the free-tier LLM) is told for meal_analysis and day_adjustment — the system prompts, the user
// messages built from the meal or the day, and the privacy redaction every text passes through first (the LLM never
// sees Aaron's name; only the meal's own photos are ever attached, chosen by the nutrition module).
import type { MealSlot } from '@fitness/shared/schemas'

/** "Aaron" / "Aaron's" → "the user" / "the user's" (case-insensitive, whole word). */
export function redact(text: string): string {
  return text.replace(/\baaron('s)?\b/gi, (_, s?: string) => (s ? "the user's" : 'the user'))
}

export const MEAL_ANALYSIS_SYSTEM = `You turn one meal into a list of foods with portion weights for a personal nutrition log.
Return only JSON that matches the schema.

Items
- One item per distinct food or drink. Keep a mixed dish as one item ("beef chili") unless its parts are clearly separate ("rice" and "chicken").
- name: a short, plain food name in lower case, with the cooking state when it matters: "chicken breast, grilled", "white rice, cooked", "egg, fried", "oatmeal, cooked with water", "salmon, baked". Write a brand capitalised as printed: "Oikos Pro greek yogurt", "Kirkland protein bar". Plain foods have no brand.
- Never add words that change the food: "milk" stays "milk" (not chocolate milk), "almonds" stay "almonds" (not almond butter), "oatmeal" is the porridge (not a cookie).
- grams: the edible weight eaten, as cooked and served. Convert counts and household measures: 1 large egg 50 g, 1 slice of bread 30 g, 1 cup cooked rice 160 g, 1 cup milk 245 g, 1 tbsp butter 14 g, 1 tbsp peanut butter 16 g, 1 medium banana 118 g, 1 cup black coffee 240 g. Liquids: 1 ml = 1 g.
- confidence (0 to 1): how sure you are of both the food and the grams. A stated weight or a count with a standard size can be 0.9 or more; a portion judged from a photo is rarely above 0.8; a vague description ("some pasta") 0.5 or less.
- candidates: up to 3 database foods you are certain exist: {"source":"usda","source_id":"<FoodData Central fdcId>"} for a generic food, or {"source":"off","source_id":"<barcode>"} for a branded product. Use [] when unsure. Never invent ids.
- estimate: your best nutrition PER 100 g of the item as named (kcal, protein_g, carbs_g, fat_g, fibre_g). It is used only when no database food matches.

notes: one short sentence about anything ambiguous, or "".
If a photo shows no food or drink, return no items and say so in notes.`

/** The user message for one meal: its slot, its text (redacted) and how many photos are attached. */
export function mealAnalysisMessage(slot: MealSlot, text: string | null, photos: number): string {
  const lines = [`Meal slot: ${slot}.`]
  if (photos > 0) lines.push(`${photos} photo${photos > 1 ? 's' : ''} of the meal attached. List the foods and drinks you can see.`)
  if (text) lines.push(`${photos > 0 ? 'Note with the photo' : 'What was eaten'}: """${redact(text)}"""`)
  return lines.join('\n')
}

export const DAY_ADJUSTMENT_SYSTEM = `You write the short text on a nutrition app's day card, shown after a meal is logged or a fast starts.
The numbers and the suggested foods are computed by the app and are final: never change, recompute or contradict them, and never suggest eating less than the day's targets allow.
Tone: plain, warm, practical; a card, never a nag. No emojis.
Return only JSON: {"why": [one reason per suggestion, in the given order, at most 15 words each], "note": one line, at most 25 words}.
- status "ok": the note says what is left in a helpful way.
- status "over": the note is calm (one day over is fine, the weekly trend matters) and suggests a light, protein-first rest of day.
- status "protein_short": the note points to protein-dense choices for what is left.
- fast_day true: no suggestions; the note is about drinking water through the day (water_target_ml) and keeping any training light (a walk or an easy session).`

export interface AdjustmentFacts {
  date: string
  fast_day: boolean
  status: 'ok' | 'over' | 'protein_short'
  remaining: { kcal: number; protein_g: number; carbs_g: number; fat_g: number }
  eaten: { kcal: number; protein_g: number }
  targets: { kcal: number; protein_g: number } | null
  water_target_ml: number | null
  suggestions: { label: string; grams: number; kcal: number; protein_g: number }[]
}

/** The user message for a day card: the computed facts as JSON (labels redacted). */
export function dayAdjustmentMessage(facts: AdjustmentFacts): string {
  return JSON.stringify({ ...facts, suggestions: facts.suggestions.map((s) => ({ ...s, label: redact(s.label) })) })
}
