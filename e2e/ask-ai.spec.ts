// Owns: the Ask AI tab with no LLM keys — a question gets the calm "isn't set up yet" reply in the thread,
// the page keeps working (composer ready for the next message), nothing crashes, and a chat can be deleted for good
// from the past-chats list.
import { expect, test } from './support'

test('Ask AI answers calmly when no model is reachable', async ({ page }) => {
  await page.goto('/ai')
  await expect(page.getByRole('heading', { name: 'Ask AI', level: 1 })).toBeVisible()

  const message = page.getByRole('textbox', { name: 'Message' })
  await message.fill('How is my weight trend this week?')
  await page.getByRole('button', { name: 'Send' }).click()

  const turn = page.getByTestId('ask-ai-turn').last()
  await expect(turn.getByTestId('ask-ai-question')).toHaveText('How is my weight trend this week?')
  await expect(turn.getByTestId('ask-ai-reply')).toContainText("Ask AI isn't set up yet", {
    timeout: 30_000,
  })
  await expect(turn.getByTestId('ask-ai-reply')).toContainText('Nothing is lost')
  await expect(page.getByRole('alert')).toHaveCount(0)

  // Still usable: the composer is cleared and takes the next question.
  await expect(message).toHaveValue('')
  await message.fill('And my protein?')
  await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled()
})

test('a chat can be deleted, and deleting the open one starts a new chat', async ({ page }) => {
  const question = `Delete me ${Date.now()}`
  await page.goto('/ai')
  await page.getByRole('textbox', { name: 'Message' }).fill(question)
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByTestId('ask-ai-turn').last().getByTestId('ask-ai-reply')).toBeVisible({ timeout: 30_000 })

  await test.step('the chat is in the past-chats list with a delete on its row', async () => {
    await page.getByRole('button', { name: 'Past chats' }).click()
    const row = page.getByRole('menuitem').filter({ hasText: question })
    await expect(row).toBeVisible()
    await expect(row.getByRole('button', { name: /^Delete chat:/ })).toBeVisible()

    await row.getByRole('button', { name: /^Delete chat:/ }).click()
    const confirm = page.getByTestId('chat-delete-confirm')
    await expect(confirm).toBeVisible()
    await confirm.click()
    await expect(confirm).toBeHidden()
  })

  await test.step('the chat is gone and the page is on a fresh thread', async () => {
    // Deleting the open chat leaves a new empty one, so the starters come back.
    await expect(page.getByTestId('ask-ai-turns').getByTestId('ask-ai-turn')).toHaveCount(0)
    await expect(page.getByTestId('ask-ai-suggestions')).toBeVisible()

    await page.getByRole('button', { name: 'Past chats' }).click()
    await expect(page.getByRole('menuitem').filter({ hasText: question })).toHaveCount(0)
  })
})
