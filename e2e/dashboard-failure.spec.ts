// Owns: the Dashboard's failure path (SPEC §12 "a failed read shows a way on"). Both of its essential reads fail with
// nothing saved on this phone — the same shape as an offline first visit or an expired session — and the page must show
// its error card with a way on, never an endless skeleton. Regression: `useDashboardData` reported `loading` whenever
// an essential had no data, which is also true once a read has *stopped*, so the page's skeleton and its error branch
// were the same condition and the error card (the only place "Sign in again" / "Try again" live) was unreachable.
import { expect, test } from './support'

test('a dashboard whose essentials cannot be read shows the error card, not an endless skeleton', async ({ page }) => {
  // The two essentials never answer. The rest of the page's reads do, so the failure is theirs alone.
  await page.route(/\/api\/days/, (route) => route.abort('failed'))
  await page.route(/\/api\/trend/, (route) => route.abort('failed'))

  await page.goto('/dashboard')

  const error = page.getByTestId('dashboard-error')
  // The reads are retried twice before the query settles, so allow for the backoff.
  await expect(error).toBeVisible({ timeout: 30_000 })
  await expect(error).toContainText("Couldn't load the dashboard.")
  await expect(error.getByRole('button', { name: 'Try again' })).toBeVisible()
  // `dashboard-page` is the skeleton's and the ready page's container; neither may be on screen with no data.
  await expect(page.getByTestId('dashboard-page')).toHaveCount(0)
})
