// Owns: seam tests for the food maths (SPEC §6) — a portion of a per-100 g food and meal totals, to 0.1.
import { describe, expect, test } from 'vitest'
import { portion, scaleNutrients, sumNutrients } from '../index'

describe('nutrition', () => {
  test('a 120 g banana (89 kcal per 100 g, fibre unknown) is 106.8 kcal with 0 fibre', () => {
    const banana = { kcal_per_100g: 89, protein_g: 1.1, carbs_g: 22.8, fat_g: 0.3, fibre_g: null }

    expect(portion(banana, 120)).toEqual({ kcal: 106.8, protein_g: 1.3, carbs_g: 27.4, fat_g: 0.4, fibre_g: 0 })
    expect(sumNutrients([portion(banana, 120), portion(banana, 120)])).toEqual({ kcal: 213.6, protein_g: 2.6, carbs_g: 54.8, fat_g: 0.8, fibre_g: 0 })
  })
})

describe('nutrition: zero grams and rescaling', () => {
  const banana = { kcal_per_100g: 89, protein_g: 1.1, carbs_g: 22.8, fat_g: 0.3, fibre_g: 2.6 }

  test('0 g of a food is nothing', () => {
    expect(portion(banana, 0)).toEqual({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0 })
  })

  test('rescaling a 120 g portion to 60 g halves it: 106.8 → 53.4 kcal', () => {
    expect(scaleNutrients(portion(banana, 120), 60 / 120)).toEqual({ kcal: 53.4, protein_g: 0.7, carbs_g: 13.7, fat_g: 0.2, fibre_g: 1.6 })
  })
})
