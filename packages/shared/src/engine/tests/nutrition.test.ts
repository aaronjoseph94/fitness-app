// Owns: seam tests for the food maths (SPEC §6) — a portion of a per-100 g food and meal totals, to 0.1.
import { describe, expect, test } from 'vitest'
import { portion, sumNutrients } from '../index'

describe('nutrition', () => {
  test('a 120 g banana (89 kcal per 100 g, fibre unknown) is 106.8 kcal with 0 fibre', () => {
    const banana = { kcal_per_100g: 89, protein_g: 1.1, carbs_g: 22.8, fat_g: 0.3, fibre_g: null }

    expect(portion(banana, 120)).toEqual({ kcal: 106.8, protein_g: 1.3, carbs_g: 27.4, fat_g: 0.4, fibre_g: 0 })
    expect(sumNutrients([portion(banana, 120), portion(banana, 120)])).toEqual({ kcal: 213.6, protein_g: 2.6, carbs_g: 54.8, fat_g: 0.8, fibre_g: 0 })
  })
})
