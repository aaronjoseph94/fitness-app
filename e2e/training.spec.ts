// Owns: SPEC §12 phase 3 acceptance — "building and logging a four-exercise session takes under three minutes":
// build a template from library search, save it, start a session, log one set per exercise, finish, and the
// summary shows the volume and the session's muscle map.
import { expect, test } from './support'

const EXERCISES = [
  { search: 'bench press', name: 'Barbell Bench Press - Medium Grip', kg: '60', reps: '8' },
  { search: 'leg press', name: 'Leg Press', kg: '120', reps: '10' },
  { search: 'seated cable', name: 'Seated Cable Rows', kg: '50', reps: '10' },
  { search: 'dumbbell shoulder', name: 'Dumbbell Shoulder Press', kg: '20', reps: '8' },
]
/** Σ reps × kg over the four logged sets. */
const VOLUME_KG = EXERCISES.reduce((sum, e) => sum + Number(e.kg) * Number(e.reps), 0)

test('Aaron builds a four-exercise template and logs a session in under three minutes', async ({ page }) => {
  const started = Date.now()
  await page.goto('/train')
  await page.getByRole('region', { name: 'Templates' }).getByRole('link', { name: 'New' }).click()
  await expect(page.getByRole('heading', { name: 'Workout builder', level: 1 })).toBeVisible()

  await test.step('build the template', async () => {
    await page.getByRole('textbox', { name: 'Template name' }).fill('Upper/Lower E2E')
    await page.getByRole('button', { name: 'Add exercise' }).click()
    const picker = page.getByRole('dialog', { name: 'Add exercise' })
    for (const { search, name } of EXERCISES) {
      await picker.getByRole('searchbox', { name: 'Search exercises' }).fill(search)
      await picker.getByRole('button', { name: new RegExp(`^${escape(name)} `) }).click()
    }
    await picker.getByRole('button', { name: 'Done' }).click()
    await expect(page.getByTestId('builder-exercise')).toHaveCount(4)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page).toHaveURL(/\/train\/builder\/[0-9a-f-]{36}$/)
    await expect(page.getByText('Template saved')).toBeVisible()
  })

  await test.step('start a session and log one set per exercise', async () => {
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page).toHaveURL(/\/train\/session\/[0-9a-f-]{36}$/)
    const cards = page.getByTestId('exercise-log-card')
    await expect(cards).toHaveCount(4)
    for (const { name, kg, reps } of EXERCISES) {
      const card = cards.filter({ hasText: name })
      await card.getByRole('textbox', { name: 'Set 1 load in kg' }).fill(kg)
      await card.getByRole('textbox', { name: 'Set 1 reps' }).fill(reps)
      await card.getByRole('button', { name: 'Mark set 1 done' }).click()
      await expect(card.getByRole('button', { name: 'Set 1 done, tap to undo' })).toBeVisible()
    }
  })

  await test.step('finish and see the summary', async () => {
    await page.getByRole('button', { name: 'Finish session' }).click()
    const dialog = page.getByRole('dialog', { name: 'Finish session?' })
    await expect(dialog).toContainText('4 of')
    await dialog.getByRole('button', { name: 'Finish' }).click()
    const summary = page.getByTestId('session-summary')
    await expect(summary.getByTestId('summary-volume')).toContainText(VOLUME_KG.toLocaleString('en-CA'))
    const map = summary.getByTestId('summary-muscle-map')
    await expect(map.getByRole('img', { name: 'Muscles trained this session' })).toBeVisible()
  })

  const seconds = (Date.now() - started) / 1000
  test.info().annotations.push({ type: 'duration', description: `${seconds.toFixed(1)} s to build and log` })
  expect(seconds, 'SPEC §12: build and log a four-exercise session in under three minutes').toBeLessThan(180)
})

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
