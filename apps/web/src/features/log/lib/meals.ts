// Owns: the day's meals as the Log tab shows them — GET /api/meals for the date, plus meals created, edited or deleted
// on this phone that have not synced yet (created ones appear with what is known; deleted ones disappear; edited ones
// show the edit) — and turning a shown meal back into the items list a PATCH sends.
import { endpoints } from '@fitness/shared/api'
import type { Favourite, Meal, MealItemInput, MealSlot, MealStatus, Nutrients } from '@fitness/shared/schemas'
import type * as z from 'zod'
import { useMemo } from 'react'
import { useApiQuery } from '../../../api'
import { dateOf, scaled, sum, usePendingLogs } from '../../quick-log'

export interface ItemView {
  id: string
  foodId: string | null
  description: string
  grams: number
  /** Null when the item is waiting to sync and its nutrition comes from the server. */
  nutrients: Nutrients | null
  estimated: boolean
}

export interface MealView {
  id: string
  slot: MealSlot
  eatenAt: string
  status: MealStatus
  inputMethod: Meal['input_method']
  rawText: string | null
  items: ItemView[]
  /** Null when part of it is not known until it syncs. */
  totals: Nutrients | null
  /** A create or edit for it is waiting (queued offline or still saving). */
  pending: 'create' | 'edit' | null
  queued: boolean
  /** The server row, when there is one. */
  meal: Meal | null
}

function itemNutrients(item: Meal['items'][number]): Nutrients {
  return { kcal: item.kcal, protein_g: item.protein_g, carbs_g: item.carbs_g, fat_g: item.fat_g, fibre_g: item.fibre_g }
}

function fromServer(meal: Meal): MealView {
  return {
    id: meal.id,
    slot: meal.slot,
    eatenAt: meal.eaten_at,
    status: meal.status,
    inputMethod: meal.input_method,
    rawText: meal.raw_text,
    items: meal.items.map((i) => ({
      id: i.id,
      foodId: i.food_id,
      description: i.description,
      grams: i.grams,
      nutrients: itemNutrients(i),
      estimated: i.estimated,
    })),
    totals: meal.totals,
    pending: null,
    queued: false,
    meal,
  }
}

/** Items of a create or patch body, using what is already known about each item id. */
function itemsFromInput(inputs: readonly z.input<typeof MealItemInput>[], known: Map<string, ItemView>): ItemView[] {
  return inputs.map((input) => {
    const before = known.get(input.id)
    if ('food_id' in input) {
      const nutrients = before?.nutrients && before.grams > 0 ? scaled(before.nutrients, input.grams / before.grams) : null
      return {
        id: input.id,
        foodId: input.food_id,
        description: input.description ?? before?.description ?? 'Food',
        grams: input.grams,
        nutrients,
        estimated: before?.estimated ?? false,
      }
    }
    return {
      id: input.id,
      foodId: null,
      description: input.description,
      grams: input.grams,
      nutrients: { kcal: input.kcal, protein_g: input.protein_g, carbs_g: input.carbs_g, fat_g: input.fat_g, fibre_g: input.fibre_g },
      estimated: input.estimated ?? false,
    }
  })
}

function totalsOf(items: readonly ItemView[]): Nutrients | null {
  if (items.some((i) => i.nutrients === null)) return null
  return sum(items.map((i) => i.nutrients as Nutrients))
}

export interface DayMeals {
  meals: MealView[]
  isLoading: boolean
  error: unknown
  refetch: () => void
}

export function useDayMeals(date: string, favourites: readonly Favourite[]): DayMeals {
  const list = useApiQuery(endpoints.nutrition.listMeals, { query: { date } })
  const creates = usePendingLogs(endpoints.nutrition.createMeal)
  const updates = usePendingLogs(endpoints.nutrition.updateMeal)
  const deletes = usePendingLogs(endpoints.nutrition.deleteMeal)

  const meals = useMemo(() => {
    const byId = new Map<string, MealView>()
    for (const meal of list.data ?? []) byId.set(meal.id, fromServer(meal))

    for (const p of creates) {
      const body = p.body
      if (dateOf(body.eaten_at) !== date || byId.has(body.id)) continue
      let items: ItemView[] = []
      let totals: Nutrients | null = null
      let rawText: string | null = null
      if (body.input_method === 'manual' || body.input_method === 'barcode') {
        items = itemsFromInput(body.items, new Map())
        totals = totalsOf(items)
      } else if (body.input_method === 'favorite') {
        const fav = favourites.find((f) => f.id === body.favorite_id)
        const scale = body.scale ?? 1
        if (fav) {
          totals = scaled(fav.totals, scale)
          items = [{ id: body.id, foodId: null, description: scale === 1 ? fav.label : `${fav.label} ×${scale}`, grams: 0, nutrients: totals, estimated: false }]
        }
      } else {
        rawText = 'raw_text' in body ? (body.raw_text ?? null) : null
      }
      byId.set(body.id, {
        id: body.id,
        slot: body.slot,
        eatenAt: body.eaten_at,
        status: body.input_method === 'text' || body.input_method === 'voice' || body.input_method === 'photo' ? 'parsing' : 'confirmed',
        inputMethod: body.input_method,
        rawText,
        items,
        totals,
        pending: 'create',
        queued: p.queued,
        meal: null,
      })
    }

    for (const p of updates) {
      const id = p.path.split('/')[3]
      const view = id ? byId.get(id) : undefined
      if (!view) continue
      const items = p.body.items ? itemsFromInput(p.body.items, new Map(view.items.map((i) => [i.id, i]))) : view.items
      byId.set(view.id, {
        ...view,
        slot: p.body.slot ?? view.slot,
        eatenAt: p.body.eaten_at ?? view.eatenAt,
        status: p.body.confirm ? 'confirmed' : view.status,
        items,
        totals: p.body.items ? totalsOf(items) : view.totals,
        pending: view.pending ?? 'edit',
        queued: view.queued || p.queued,
      })
    }

    for (const p of deletes) {
      const id = p.path.split('/')[3]
      if (id) byId.delete(id)
    }

    return [...byId.values()].sort((a, b) => a.eatenAt.localeCompare(b.eatenAt))
  }, [list.data, creates, updates, deletes, favourites, date])

  return { meals, isLoading: list.isLoading, error: list.error, refetch: () => void list.refetch() }
}

/** A shown item as a PATCH item: a food reference keeps the server's per-100 g maths; custom nutrition is rescaled. */
export function toItemInput(item: ItemView, grams: number): MealItemInput {
  if (item.foodId) return { id: item.id, food_id: item.foodId, grams, description: item.description }
  const n = item.nutrients ?? { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0 }
  const f = item.grams > 0 ? grams / item.grams : 1
  const r = (v: number) => Math.round(v * f * 10) / 10
  return {
    id: item.id,
    description: item.description,
    grams,
    kcal: r(n.kcal),
    protein_g: r(n.protein_g),
    carbs_g: r(n.carbs_g),
    fat_g: r(n.fat_g),
    fibre_g: r(n.fibre_g),
    estimated: item.estimated,
  }
}
