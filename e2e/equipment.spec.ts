// Owns: the equipment screen as the floor a workout is built from — the machines at Anytime Fitness Lacombe grouped
// by area, what the club does not have listed as such, and a status change moving the allowed exercise count (through
// PUT /api/equipment, so it survives a reload).
import { expect, test } from './support'

/** The area sections, in order, with the machines each holds (Aaron's list, plus the bench the racks imply). */
const AREAS: readonly [string, number][] = [
  ['Life Fitness', 11],
  ['Hammer Strength', 20],
  ['Racks & rigs', 5],
  ['Free weights', 4],
  ['Cardio', 8],
  ['Not at your gym', 8],
]

test('the equipment screen lists the machines of his club by area', async ({ page }) => {
  await page.goto('/train/equipment')
  await expect(page.getByRole('heading', { name: 'Machines', level: 2 })).toBeVisible()

  const group = (name: string) => page.getByTestId('equipment-area').filter({ has: page.getByRole('heading', { name, level: 2 }) })
  await expect(page.getByTestId('equipment-area')).toHaveCount(AREAS.length)
  for (const [name, count] of AREAS) await expect(group(name).getByTestId('equipment-row'), `${name} rows`).toHaveCount(count)

  // A machine he has, with the note that says what it stands in for; and the machines the club lacks, with a reason.
  await expect(group('Hammer Strength').getByText('V-squat')).toBeVisible()
  await expect(group('Hammer Strength').getByText('stands in for the hack squat')).toBeVisible()
  await expect(group('Not at your gym').getByText('T-bar row')).toBeVisible()
  await expect(group('Not at your gym').getByText('No glute-ham developer.')).toBeVisible()

  // The library values are their own card, above the machines, and the count the profile produces is stated.
  await expect(page.getByRole('heading', { name: 'Equipment', level: 2 })).toBeVisible()
  await expect(page.getByText(/\d+ of \d+ exercises are allowed now/)).toBeVisible()
})

test('a machine marked "Don\'t have" takes its exercises out of the allowed set', async ({ page }) => {
  await page.goto('/train/equipment')
  const allowed = async () => {
    const text = (await page.getByText(/\d+ of \d+ exercises are allowed now/).textContent()) ?? ''
    return Number(text.match(/([\d,]+) of/)![1]!.replaceAll(',', ''))
  }
  const before = await allowed()

  const row = page.getByTestId('equipment-row').filter({ hasText: 'Leg extension' })
  await row.getByRole('button', { name: "Don't have" }).click()
  await expect.poll(allowed, { message: 'the count follows the status' }).toBeLessThan(before)

  const dropped = await allowed()
  await page.reload()
  await expect.poll(allowed).toBe(dropped) // saved through the API, not just on the phone

  // Put it back so the rest of the run sees the profile the seed created.
  const restore = page.getByTestId('equipment-row').filter({ hasText: 'Leg extension' })
  await restore.getByRole('button', { name: 'Have', exact: true }).click()
  await expect.poll(allowed).toBe(before)
})
