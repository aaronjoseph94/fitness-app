// Owns: Train's "This week" card on the seeded default (Mon, Tue, Thu): the three training days with the split those
// days give (engine splitSlots: Mon Upper A · Tue Lower A · Thu Full body), a picked Wednesday previewing the four-day
// split without saving it, Generate on a Worker with no model key saying where to add one (nothing written), and the
// coverage line listing the muscle groups no template reaches yet.
import type { Page } from '@playwright/test'
import { expect, test } from './support'

/** The seeded training days and the split they give, in week order. */
const SEEDED = [/^Mon\s*Upper A/, /^Tue\s*Lower A/, /^Thu\s*Full body/]
const SEEDED_PREVIEW = 'Mon Upper A · Tue Lower A · Thu Full body'
/** Mon–Thu: the upper / lower split. */
const WITH_WEDNESDAY_PREVIEW = 'Mon Upper A · Tue Lower A · Wed Upper B · Thu Lower B'

/** The card, its training-day rows (from the Worker), its day chips and its preview line (live, from the chips). */
async function thisWeek(page: Page) {
  await page.goto('/train')
  const card = page.getByRole('region', { name: 'This week', exact: true })
  await expect(card).toBeVisible()
  // A chip's name is the weekday, with ", today" on today's chip.
  const chip = (weekday: string) =>
    card
      .getByRole('group', { name: 'Training days' })
      .getByRole('button', { name: new RegExp(`^${weekday}`) })
  return {
    card,
    days: card.getByRole('list', { name: 'Your training days' }).getByRole('listitem'),
    chip,
    preview: card.getByTestId('week-preview'),
  }
}

test('Train shows the seeded week: Mon Upper A, Tue Lower A, Thu Full body', async ({ page }) => {
  const { days, chip, preview } = await thisWeek(page)

  await expect(days).toHaveText(SEEDED)
  await expect(preview).toHaveText(SEEDED_PREVIEW)
  for (const weekday of ['Monday', 'Tuesday', 'Thursday'])
    await expect(chip(weekday), weekday).toHaveAttribute('aria-pressed', 'true')
  for (const weekday of ['Wednesday', 'Friday', 'Saturday', 'Sunday'])
    await expect(chip(weekday), weekday).toHaveAttribute('aria-pressed', 'false')
})

test('picking Wednesday previews the four-day split, and unpicking it restores three (nothing saved)', async ({
  page,
}) => {
  const { days, chip, preview } = await thisWeek(page)

  await chip('Wednesday').click()
  await expect(chip('Wednesday')).toHaveAttribute('aria-pressed', 'true')
  await expect(preview).toHaveText(WITH_WEDNESDAY_PREVIEW)
  await expect(days, 'a preview, not his training days yet').toHaveText(SEEDED)

  await chip('Wednesday').click()
  await expect(chip('Wednesday')).toHaveAttribute('aria-pressed', 'false')
  await expect(preview).toHaveText(SEEDED_PREVIEW)
  await expect(days).toHaveText(SEEDED)
})

test('Generate without a model key says where to add one, and the week stays as it was', async ({ page }) => {
  const { card, days, chip, preview } = await thisWeek(page)
  const generate = card.getByRole('button', { name: 'Generate', exact: true })

  await generate.click()
  // The e2e Worker has no LLM keys (playwright.config.ts): POST /api/ai/week answers 409 no_model_key.
  const note = card.getByRole('alert')
  await expect(note).toHaveText('Add a model key in Settings → AI to use this.')
  await expect(note.getByRole('link', { name: 'Settings → AI' })).toHaveAttribute('href', '/settings/ai')

  await expect(generate).toBeEnabled()
  await expect(days).toHaveText(SEEDED)
  await expect(preview).toHaveText(SEEDED_PREVIEW)
  await expect(card.getByTestId('week-day-status'), 'no day is drafting').toHaveCount(0)

  // Nothing was written: a reload shows the same days.
  await page.reload()
  await expect(days).toHaveText(SEEDED)
  await expect(chip('Wednesday')).toHaveAttribute('aria-pressed', 'false')
})

test('the coverage line lists the muscle groups no template reaches yet', async ({ page }) => {
  const { card } = await thisWeek(page)
  const coverage = card.getByTestId('week-uncovered')
  await expect(coverage).toBeVisible()
  await expect(coverage).toHaveText(/^Not covered yet: \S/)
})
