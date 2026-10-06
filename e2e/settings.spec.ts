// Owns: the Settings tab's two 2026-10-06 promises — every profile field is editable and a save persists (no
// read-only profile rows), and the rows that were deliberately removed stay removed (the breakfast switch, the
// styleguide link and its route).
import { expect, test } from './support'

/** Every profile field the page must expose as a row (the shared ProfilePatch, in the page's order). */
const PROFILE_FIELDS = [
  'goal_weight_kg',
  'goal_date',
  'start_weight_kg',
  'start_date',
  'height_cm',
  'sex',
  'birth_date',
  'timezone',
] as const

test('the whole profile is editable, and an edit persists', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()

  await test.step('every field is a tappable row that opens an editor', async () => {
    for (const field of PROFILE_FIELDS) {
      const row = page.getByTestId(`profile-${field}`)
      await expect(row, `${field} row`).toBeVisible()
      await row.click()
      const dialog = page.getByRole('dialog')
      await expect(dialog, `${field} editor`).toBeVisible()
      await expect(dialog.getByTestId(`profile-${field}-input`)).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
    }
  })

  await test.step('a save reaches the server and survives a reload', async () => {
    const row = page.getByTestId('profile-height_cm')
    const before = (await row.textContent())?.match(/([\d.]+)\s*cm/)?.[1] ?? '165.1'
    const next = before === '166.1' ? '165.1' : '166.1'

    await row.click()
    const dialog = page.getByRole('dialog')
    await dialog.getByTestId('profile-height_cm-input').fill(next)
    await dialog.getByTestId('profile-height_cm-save').click()
    await expect(dialog).toBeHidden()
    await expect(page.getByTestId('profile-height_cm')).toContainText(`${next} cm`)

    await page.reload()
    await expect(page.getByTestId('profile-height_cm')).toContainText(`${next} cm`)

    // Put it back so the next story sees the profile the seed created.
    await page.getByTestId('profile-height_cm').click()
    const restore = page.getByRole('dialog')
    await restore.getByTestId('profile-height_cm-input').fill(before)
    await restore.getByTestId('profile-height_cm-save').click()
    await expect(restore).toBeHidden()
    await expect(page.getByTestId('profile-height_cm')).toContainText(`${before} cm`)
  })
})

test('the removed rows and routes are gone', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()

  // Breakfast is not a setting any more: it is simply the first meal of the day.
  await expect(page.getByTestId('setting-breakfast_enabled')).toHaveCount(0)
  await expect(page.getByText('Breakfast', { exact: true })).toHaveCount(0)
  // The styleguide is gone from the app, its link included.
  await expect(page.getByText('Styleguide')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Styleguide/ })).toHaveCount(0)

  await page.goto('/styleguide')
  await expect(page.getByRole('heading', { name: 'Page not found', level: 2 })).toBeVisible()
})
