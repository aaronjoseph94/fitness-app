// Owns: SPEC §12 phase 4 acceptance — "the weekly report prints on one or two Letter pages": this ISO week's report
// renders with its charts, and the PDF Chromium prints from it (Letter, 15 mm margins) has at most two pages.
import { expect, isoWeek, test, todayLocal } from './support'

test("this week's report renders and prints on at most two Letter pages", async ({ page }) => {
  const week = isoWeek(todayLocal())
  await page.goto(`/reports/week/${week}`)

  const report = page.getByTestId('weekly-report')
  await expect(report).toContainText(`WEEKLY REPORT · ${week}`)
  await expect(report.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(report.getByTestId('report-stats')).toBeVisible()
  for (const panel of [
    'report-weight',
    'report-calories',
    'report-macros',
    'report-water',
    'report-steps',
    'report-sleep',
  ]) {
    await expect(report.getByTestId(panel).locator('[data-testid^="chart-"]').first(), panel).toBeVisible()
  }
  await expect(
    report.getByTestId('report-muscle-map').getByRole('img', { name: `Muscles trained in ${week}` }),
  ).toBeVisible()

  const pdf = await page.pdf({
    format: 'Letter',
    printBackground: true,
    margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
  })
  const pages = pdf.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0
  test.info().annotations.push({ type: 'pdf', description: `${pages} Letter page(s), ${pdf.length} bytes` })
  expect(pages).toBeGreaterThanOrEqual(1)
  expect(pages, 'SPEC §12: the weekly report prints on one or two Letter pages').toBeLessThanOrEqual(2)
})
