// Owns: the Ask AI tab with no LLM keys — a question gets the calm "can't reach the AI right now" reply in the thread,
// the page keeps working (composer ready for the next message), and nothing crashes.
import { expect, test } from './support'

test('Ask AI answers calmly when no model is reachable', async ({ page }) => {
  await page.goto('/ai')
  await expect(page.getByRole('heading', { name: 'Ask AI', level: 1 })).toBeVisible()

  const message = page.getByRole('textbox', { name: 'Message' })
  await message.fill('How is my weight trend this week?')
  await page.getByRole('button', { name: 'Send' }).click()

  const turn = page.getByTestId('ask-ai-turn').last()
  await expect(turn.getByTestId('ask-ai-question')).toHaveText('How is my weight trend this week?')
  await expect(turn.getByTestId('ask-ai-reply')).toContainText("I can't reach the AI right now", {
    timeout: 30_000,
  })
  await expect(turn.getByTestId('ask-ai-reply')).toContainText('Nothing is lost')
  await expect(page.getByRole('alert')).toHaveCount(0)

  // Still usable: the composer is cleared and takes the next question.
  await expect(message).toHaveValue('')
  await message.fill('And my protein?')
  await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled()
})
