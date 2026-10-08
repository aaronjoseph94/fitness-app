// Owns: SPEC §12 phase 1 acceptance — "a day can be logged in under a minute on a phone": weigh-in, water, a meal
// from food search, a fast started and ended, steps and sleep, all from Today's UI, then the rings show it.
import { expect, ring, ringValue, test } from './support'

test('Aaron logs a whole day from Today in under a minute', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible()
  const quickLog = page.getByRole('navigation', { name: 'Quick log' })
  const water = await ringValue(page, 'Water')
  const kcal = await ringValue(page, 'Calories')
  const started = Date.now()

  await test.step('weigh-in', async () => {
    await quickLog.getByRole('button', { name: 'Weigh-in' }).click()
    const sheet = page.getByRole('dialog', { name: 'Log weigh-in' })
    await sheet.getByLabel('Weight in kg').fill('94.8')
    await sheet.getByRole('button', { name: 'Save 94.8 kg' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('log-notice')).toContainText('Weigh-in 94.8 kg')
  })

  await test.step('water 500 ml', async () => {
    await quickLog.getByRole('button', { name: 'Water' }).click()
    const sheet = page.getByRole('dialog', { name: 'Log water' })
    await sheet.getByRole('button', { name: '500 ml' }).click()
    await expect(sheet.getByText('Added 500 ml')).toBeVisible()
    await sheet.getByRole('button', { name: 'Close' }).click()
    await expect(sheet).toBeHidden()
  })

  await test.step('a meal from food search', async () => {
    await quickLog.getByRole('button', { name: 'Meal' }).click()
    const sheet = page.getByRole('dialog', { name: 'Log meal' })
    // Breakfast is the first of the four slots, always: the setting that used to hide it is gone.
    const slots = sheet.getByRole('radiogroup', { name: 'Slot' }).getByRole('radio')
    await expect(slots).toHaveCount(4)
    await expect(slots).toContainText(['Breakfast', 'Lunch', 'Dinner', 'Snack'])
    await sheet.getByRole('button', { name: 'Foods' }).click()
    await sheet.getByLabel('Search foods').fill('chicken breast')
    await sheet
      .getByRole('list', { name: 'Search results' })
      .getByRole('button', { name: /skinless, boneless, meat, raw/ })
      .click()
    await expect(
      sheet.getByLabel('Grams of Chicken, broiler, breast, skinless, boneless, meat, raw'),
    ).toBeVisible()
    await sheet.getByRole('button', { name: /^Log meal · \d[\d,]* kcal/ }).click()
    await expect(sheet).toBeHidden()
  })

  await test.step('start and end a fast', async () => {
    await quickLog.getByRole('button', { name: 'Start fast' }).click()
    const sheet = page.getByRole('dialog', { name: 'Log fast' })
    await sheet.getByRole('button', { name: 'Start fast now' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('log-notice')).toContainText('Fast started')

    await quickLog.getByRole('button', { name: 'End fast' }).click()
    await sheet.getByRole('button', { name: 'End fast' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('log-notice')).toContainText('Fast ended')
    await expect(quickLog.getByRole('button', { name: 'Start fast' })).toBeVisible()
  })

  await test.step('steps and sleep', async () => {
    await page.getByRole('button', { name: 'Add steps or sleep' }).click()
    const dialog = page.getByRole('dialog', { name: 'Steps and sleep' })
    await dialog.getByLabel('Steps').fill('9120')
    await dialog.getByLabel('Hours asleep').fill('7.5')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden()
  })

  await test.step('Today shows the updated rings', async () => {
    // The target itself moves (a fast day raises it), so check the amount drunk.
    await expect(ring(page, 'Water')).toHaveAccessibleName(
      new RegExp(`^Water: ${(water + 500).toLocaleString('en-US')} of `),
    )
    await expect.poll(() => ringValue(page, 'Calories')).toBeGreaterThan(kcal)
    await expect(ring(page, 'Steps')).toHaveAccessibleName(/^Steps: 9,120 of /)
    await expect(ring(page, 'Sleep')).toHaveAccessibleName(/^Sleep: 7\.5 of /)
  })

  const seconds = (Date.now() - started) / 1000
  test.info().annotations.push({ type: 'duration', description: `${seconds.toFixed(1)} s to log the day` })
  expect(seconds, 'SPEC §12: a day logs in under a minute').toBeLessThan(60)
})
