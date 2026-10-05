// Owns: what every e2e story shares — `test` that fails on any uncaught page error (a crash is never a pass),
// Edmonton dates and ISO weeks computed the same way the spec defines them, ring readings, and the local MCP token.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test as base, expect, type Locator, type Page } from '@playwright/test'

export { expect }

export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await use(errors)
      expect(errors, 'uncaught errors in the page').toEqual([])
    },
    { auto: true },
  ],
})

const TZ = 'America/Edmonton'

/** Today in Edmonton as YYYY-MM-DD. */
export function todayLocal(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** ISO 8601 week of a local date, e.g. 2026-10-05 → "2026-W41" (weeks start Monday; week 1 holds Jan 4). */
export function isoWeek(date: string): string {
  const day = new Date(`${date}T12:00:00Z`)
  const weekday = (day.getUTCDay() + 6) % 7 // Mon 0 … Sun 6
  const thursday = new Date(day.getTime() + (3 - weekday) * 86_400_000)
  const year = thursday.getUTCFullYear()
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / (7 * 86_400_000)) + 1
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** A Today ring by metric name ("Water", "Calories", …). Its accessible name reads "Water: 500 of 3,000 ml". */
export function ring(page: Page, label: string): Locator {
  return page.getByTestId('today-rings').getByRole('img', { name: new RegExp(`^${label}: `) })
}

/** The current value a ring reports (the number before "of"). */
export async function ringValue(page: Page, label: string): Promise<number> {
  const name = (await ring(page, label).getAttribute('aria-label')) ?? ''
  const match = name.match(/: ([\d,.]+) of /)
  if (!match) throw new Error(`Unexpected ${label} ring label: "${name}"`)
  return Number(match[1].replaceAll(',', ''))
}

/** MCP_BEARER_TOKEN from apps/worker/.dev.vars (created from .dev.vars.example by e2e/server.mjs). */
export function mcpToken(): string {
  const vars = readFileSync(path.resolve(import.meta.dirname, '..', 'apps', 'worker', '.dev.vars'), 'utf8')
  const token = vars.match(/^MCP_BEARER_TOKEN=(.+)$/m)?.[1]?.trim()
  if (!token) throw new Error('MCP_BEARER_TOKEN missing from apps/worker/.dev.vars')
  return token
}
