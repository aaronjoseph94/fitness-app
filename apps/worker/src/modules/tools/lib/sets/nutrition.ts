// Owns: the nutrition tools — log_meal, confirm_meal, search_foods (the nutrition module: meals with items, the food
// cache and sources). Item ids are generated here; a meal's local date comes from its eaten_at instant.
import { today } from '@fitness/shared/engine'
import {
  Barcode,
  Food,
  Grams,
  Id,
  Instant,
  LocalDate,
  Meal,
  MealSlot,
  Nutrients,
  type MealItemInput,
} from '@fitness/shared/schemas'
import * as z from 'zod'
import { localInstant } from '../../../coach'
import { createMeal, searchFoods, updateMeal } from '../../../nutrition'
import { badRequest } from '../../../../lib/http-error'
import { defineTool, type ToolDefinition } from '../define'

/** Clock time a meal logged for another day is placed at, by slot. */
const SLOT_TIME: Record<MealSlot, string> = {
  breakfast: '08:00',
  lunch: '12:30',
  snack: '15:30',
  dinner: '18:30',
}

const FoodItem = z
  .object({
    food_id: Id.describe('A food id from search_foods; nutrition is computed from its per-100 g values'),
    grams: Grams.positive(),
    description: z.string().trim().max(200).optional(),
  })
  .describe('An item from a known food')
const CustomItem = z
  .object({
    description: z.string().trim().min(1).max(200),
    grams: Grams.positive(),
    ...Nutrients.shape,
    estimated: z
      .boolean()
      .default(true)
      .describe('true when the nutrition is your estimate rather than a label or database'),
  })
  .describe('An item with its own nutrition for the given grams')
const ItemInput = z.union([FoodItem, CustomItem])

const withIds = (items: readonly z.output<typeof ItemInput>[]): MealItemInput[] =>
  items.map((i) => ({ ...i, id: crypto.randomUUID() }))

export const NUTRITION_TOOLS: readonly ToolDefinition[] = [
  defineTool({
    name: 'log_meal',
    title: 'Log a meal',
    area: 'nutrition',
    description:
      "Log one meal in a slot (lunch, dinner, snack; breakfast only if Aaron eats it). Give EITHER items — food_id + grams from search_foods (preferred), or a description with grams and your nutrition estimate (kcal, protein_g, carbs_g, fat_g, fibre_g for those grams) — which confirms the meal at once and updates today's remaining targets; OR text (\"2 eggs, toast with butter\"), which the app's meal parser turns into items in about 20 s (status 'parsing', then 'review'; it confirms itself when confident, or call confirm_meal). Only log what Aaron says he ate.",
    input: z.object({
      slot: MealSlot,
      items: z.array(ItemInput).min(1).max(50).optional(),
      text: z.string().trim().min(1).max(2000).optional(),
      date: LocalDate.optional().describe('YYYY-MM-DD in Edmonton; default today'),
      eaten_at: Instant.optional().describe('When it was eaten (overrides date)'),
    }),
    output: Meal,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: (deps, i) => {
      if ((i.items === undefined) === (i.text === undefined)) throw badRequest('Give either items or text')
      const date = i.date ?? today(deps.now())
      const eaten_at =
        i.eaten_at ??
        (date === today(deps.now()) ? deps.now().toISOString() : localInstant(date, SLOT_TIME[i.slot]))
      const base = { id: crypto.randomUUID(), slot: i.slot, eaten_at }
      return i.items
        ? createMeal(deps, { ...base, input_method: 'manual', items: withIds(i.items) })
        : createMeal(deps, { ...base, input_method: 'text', raw_text: i.text! })
    },
  }),
  defineTool({
    name: 'confirm_meal',
    title: 'Confirm a meal',
    area: 'nutrition',
    description:
      "Confirm a meal waiting in review (after the parser), optionally replacing its whole item list first (same item shapes as log_meal). A confirmed meal counts toward the day's intake and triggers the day-adjustment card. Use when Aaron agrees the items are right.",
    input: z.object({ id: Id.describe('The meal id'), items: z.array(ItemInput).min(1).max(50).optional() }),
    output: Meal,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, i) =>
      updateMeal(deps, i.id, { items: i.items ? withIds(i.items) : undefined, confirm: true }),
  }),
  defineTool({
    name: 'search_foods',
    title: 'Search foods',
    area: 'nutrition',
    description:
      'Find foods by name or barcode in the local cache (Canadian Nutrient File and everything fetched before), then Open Food Facts and USDA FoodData Central. Nutrient values are per 100 g. Use the ids as log_meal items. Read-only apart from caching new foods.',
    input: z.object({
      q: z.string().trim().min(2).max(200).optional().describe('Food name, e.g. "greek yogurt plain"'),
      barcode: Barcode.optional(),
    }),
    output: z.object({ foods: z.array(Food) }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    run: async (deps, i) => {
      if (i.q === undefined && i.barcode === undefined) throw badRequest('Give q or barcode')
      return { foods: await searchFoods(deps, i) }
    },
  }),
]
