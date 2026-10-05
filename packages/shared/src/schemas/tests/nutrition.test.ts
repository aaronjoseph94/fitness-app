// Owns: the meal-create seam — a free-text meal body (SPEC §6) as POST /api/meals receives it.
import { describe, expect, test } from 'vitest'
import { MealCreate } from '../index'

describe('MealCreate', () => {
  test('a free-text lunch parses as the text variant with its eaten_at in UTC', () => {
    const body = {
      id: '0b7d6c1e-3a4f-4e2b-9c8d-1f2e3a4b5c6d',
      slot: 'lunch',
      eaten_at: '2026-10-04T12:30:00-06:00',
      input_method: 'text',
      raw_text: '2 eggs, toast with butter, black coffee',
    }
    expect(MealCreate.parse(body)).toEqual({ ...body, eaten_at: '2026-10-04T18:30:00.000Z' })
  })
})
