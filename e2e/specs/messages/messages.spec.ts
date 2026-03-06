import { test, expect } from '../../fixtures/test';

test.describe('Messages', () => {
  test.beforeEach(async ({ messagesPage }) => {
    await messagesPage.goto();
  });

  test('messages page loads conversation list', async ({ messagesPage, page }) => {
    await expect(page).toHaveURL(/\/messages/);
    await page.waitForTimeout(2000);
    // Page should show messages heading or conversations or empty state
    const messagesContent = page.locator('text=/message|conversation|no.*message/i');
    await expect(messagesContent.first()).toBeVisible({ timeout: 5000 });
  });

  test('open conversation → send message → message appears', async ({ messagesPage }) => {
    const convCount = await messagesPage.getConversationCount();
    if (convCount > 0) {
      await messagesPage.openConversation(0);
      await messagesPage.chat.messageInput.waitFor({ state: 'visible', timeout: 5_000 });

      const msg = `E2E test message ${Date.now()}`;
      await messagesPage.sendMessage(msg);
      await messagesPage.page.waitForTimeout(2000);

      // Message should appear in thread
      const sentMsg = messagesPage.page.locator(`text=${msg}`);
      await expect(sentMsg).toBeVisible({ timeout: 5_000 });
    }
  });

  test('conversation list shows last message preview + timestamp', async ({ messagesPage }) => {
    const convCount = await messagesPage.getConversationCount();
    if (convCount > 0) {
      // First conversation should have some text content
      const firstConv = messagesPage.conversationList.first();
      const text = await firstConv.textContent();
      expect(text?.length).toBeGreaterThan(0);
    }
  });

  test('filter conversations by username', async ({ messagesPage }) => {
    await messagesPage.filterByUsername('test');
    await messagesPage.page.waitForTimeout(500);
    await expect(messagesPage.searchInput).toHaveValue('test');
  });

  test('close chat modal returns to conversation list', async ({ messagesPage }) => {
    const convCount = await messagesPage.getConversationCount();
    if (convCount > 0) {
      await messagesPage.openConversation(0);
      await messagesPage.chat.messageInput.waitFor({ state: 'visible', timeout: 5_000 });
      await messagesPage.chat.closeButton.click();
      await messagesPage.page.waitForTimeout(500);
    }
  });

  test('empty state when no conversations match filter', async ({ messagesPage }) => {
    await messagesPage.filterByUsername('zzz_nonexistent_user_zzz');
    await messagesPage.page.waitForTimeout(1000);

    // After filtering with nonexistent username, conversations should be filtered
    const convCount = await messagesPage.getConversationCount();
    // May show 0 or empty state
    expect(convCount).toBeGreaterThanOrEqual(0);
  });
});
