// Owns: SPEC §12 phase 1 acceptance — "the app works offline and syncs": water logged with no network waits in the
// on-phone queue (pending badge, counted on Today), then reaches the Worker when the network returns.
import { expect, ring, ringValue, test } from './support'

test('water logged offline shows as pending, then syncs when back online', async ({ page, context }) => {
  await page.goto('/')
  const rings = page.getByTestId('today-rings')
  await expect(rings).toBeVisible()
  const before = await ringValue(page, 'Water')
  const after = new RegExp(`^Water: ${(before + 500).toLocaleString('en-US')} of `)

  await context.setOffline(true)
  await page.getByRole('navigation', { name: 'Quick log' }).getByRole('button', { name: 'Water' }).click()
  const sheet = page.getByRole('dialog', { name: 'Log water' })
  await sheet.getByRole('button', { name: '500 ml' }).click()
  await expect(sheet.getByText('Added 500 ml')).toBeVisible()
  await expect(sheet.getByTestId('pending-badge')).toBeVisible()
  await sheet.getByRole('button', { name: 'Close' }).click()

  // Queued on the phone: Today counts it already and marks it pending.
  await expect(rings.getByTestId('pending-badge')).toHaveText('Pending · 1')
  await expect(ring(page, 'Water')).toHaveAccessibleName(after)

  await context.setOffline(false)
  await expect(rings.getByTestId('pending-badge')).toBeHidden()
  await expect(ring(page, 'Water')).toHaveAccessibleName(after)

  // The server has it: a fresh load (no queue involved) shows the same total.
  await page.reload()
  await expect(ring(page, 'Water')).toHaveAccessibleName(after)
})
