// Owns: the phase 2 text-meal path with no LLM keys — the analysis falls back to "add what you ate", Aaron adds an
// item from food search in the review, confirms, and the day adjustment card shows the kcal left (or over) for today.
import { expect, test, todayLocal } from './support'

test('a described meal falls back to manual items, confirms, and shows the rest of the day', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Quick log' }).getByRole('button', { name: 'Meal' }).click()
  const form = page.getByRole('dialog', { name: 'Log meal' })
  await form.getByRole('textbox', { name: 'What did you eat?' }).fill('2 boiled eggs and a slice of toast')
  await form.getByRole('button', { name: 'Analyse' }).click()

  const review = page.getByRole('dialog', { name: 'Review meal' })
  // No provider keys: the analysis gives up gracefully and keeps what was written.
  await expect(review.getByRole('alert')).toContainText("The AI couldn't read this one just now")
  await expect(review.getByTestId('meal-raw-text')).toContainText('2 boiled eggs and a slice of toast')

  await review.getByRole('textbox', { name: 'Search foods' }).fill('egg boiled')
  await review.getByRole('list', { name: 'Search results' }).getByRole('button').first().click()
  await expect(review.getByTestId('review-item')).toHaveCount(1)
  await review.getByRole('button', { name: /^Confirm · \d[\d,]* kcal$/ }).click()

  await expect(review.getByTestId('meal-confirmed')).toContainText('logged')
  const card = review.getByTestId('day-adjustment')
  await expect(card).toContainText(/\d[\d,]*\s*kcal (left|over)/)

  // The card's number is the server's remaining kcal for today.
  const day = await (await page.request.get(`/api/day/${todayLocal()}`)).json()
  const remaining: number = day.remaining.kcal
  const kcal = Math.round(Math.abs(remaining)).toLocaleString('en-CA')
  await expect(card).toContainText(new RegExp(`${kcal}\\s*kcal ${remaining >= 0 ? 'left' : 'over'}`))

  await review.getByRole('button', { name: 'Done' }).click()
  await expect(review).toBeHidden()
})
