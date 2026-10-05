// Owns: SPEC §11 — /styleguide renders every chart in the inventory (each with its data-testid) and the muscle map,
// from sample data, without a page error.
import { expect, test } from './support'

/** SPEC §11 chart inventory, by data-testid (the muscle map is its own component below). */
const INVENTORY = [
  'chart-weight-trend',
  'chart-weekly-loss',
  'chart-calories',
  'chart-macros',
  'chart-protein-adherence',
  'chart-water',
  'chart-steps',
  'chart-sleep',
  'chart-fasting',
  'chart-body-composition',
  'chart-body-fat-visceral',
  'chart-segmental-fat',
  'chart-waist-whr',
  'chart-training-volume',
  'chart-strength',
  'chart-logging-adherence',
  'chart-milestones',
  'chart-week-plan',
]

test('the styleguide renders every chart and the muscle map', async ({ page }) => {
  await page.goto('/styleguide')
  await expect(page.getByRole('heading', { name: 'Styleguide', level: 1 })).toBeVisible()

  const charts = page.locator('[data-testid^="chart-"]')
  await expect(charts.first()).toBeVisible()
  expect(await charts.count()).toBeGreaterThanOrEqual(18)
  for (const id of INVENTORY) await expect(page.getByTestId(id).first(), id).toBeVisible()

  const map = page.getByTestId('muscle-map').first()
  await map.scrollIntoViewIfNeeded()
  await expect(map).toBeVisible()
  await expect(map.locator('svg path').first()).toBeAttached()
})
