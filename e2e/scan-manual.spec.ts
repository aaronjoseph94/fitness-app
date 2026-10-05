// Owns: the phase 4 scan path without a sheet — enter a scan by hand, confirm, and the scan page shows its charts:
// fat vs lean mass, body fat % and visceral level with gauges, and segmental fat against the 2026-09-26 baseline.
// The confirm form asks for every value on the Evolt sheet, so this types a whole (slightly better) follow-up scan.
import { expect, test } from './support'

/** Field label → value, a follow-up four weeks after the baseline (lean + fat = weight). */
const VALUES: Record<string, string> = {
  Weight: '93.4',
  'Lean body mass': '59.8',
  'Skeletal muscle mass': '32.6',
  Protein: '11.3',
  Mineral: '5.4',
  'Total body water': '43.1',
  'Intracellular fluid': '29.1',
  'Extracellular fluid': '14.0',
  'Body fat mass': '33.6',
  'Body fat': '36.0',
  'Subcutaneous fat': '27.1',
  'Visceral fat mass': '6.5',
  'Visceral fat area': '176',
  'Visceral fat level': '15',
  BMR: '1662',
  TEE: '2560',
  'Waist-to-hip ratio': '1.00',
  'Bio age': '37',
  'BWI score': '5.6',
}
/** Lean and fat kg per segment, by the segment's name as the form announces it ("Torso lean mass, kg"). */
const SEGMENTS: [string, string, string][] = [
  ['Left arm', '3.60', '2.05'],
  ['Right arm', '3.50', '2.15'],
  ['Torso', '27.8', '19.4'],
  ['Left leg', '7.55', '4.95'],
  ['Right leg', '7.53', '5.05'],
]

test('a scan entered by hand is confirmed and charted', async ({ page }) => {
  await page.goto('/scans')
  await page.getByRole('button', { name: 'Enter by hand' }).click()
  await expect(page.getByRole('heading', { name: 'Enter a scan by hand' })).toBeVisible()

  for (const [label, value] of Object.entries(VALUES)) {
    await page.getByRole('textbox', { name: label, exact: true }).fill(value)
  }
  const segments = page.getByTestId('scan-segments')
  for (const [segment, lean, fat] of SEGMENTS) {
    await segments.getByRole('textbox', { name: `${segment} lean mass, kg`, exact: true }).fill(lean)
    await segments.getByRole('textbox', { name: `${segment} fat mass, kg`, exact: true }).fill(fat)
  }
  await page.getByRole('button', { name: 'Confirm scan' }).click()

  await expect(page).toHaveURL(/\/scans\/[0-9a-f-]{36}$/)
  const scan = page.getByTestId('scan-page')
  for (const card of ['scan-chart-composition', 'scan-chart-fat-visceral', 'scan-chart-segments']) {
    await expect(scan.getByTestId(card).locator('[data-testid^="chart-"]').first(), card).toBeVisible()
  }
  await expect(scan.getByTestId('scan-gauge-body-fat')).toContainText('36.0')
  await expect(scan.getByTestId('scan-gauge-visceral')).toContainText('15')
})
