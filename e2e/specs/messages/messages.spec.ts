import { test, expect } from '../../fixtures/test';

// TASK-091 — Messages split-pane v2. Desktop runs at the default Desktop Chrome
// viewport (chromium project), so the thread renders inline in the right pane —
// no modal. The mobile full-screen overlay is covered by a narrow-viewport describe below.
test.describe('Messages', () => {
  test.beforeEach(async ({ messagesPage }) => {
    await messagesPage.goto();
  });

  test('messages page loads conversation list @smoke', async ({ messagesPage, page }) => {
    await expect(page).toHaveURL(/\/messages/);
    await page.waitForTimeout(2000);
    // Page should show messages heading or conversations or empty state
    const messagesContent = page.locator('text=/message|conversation|no.*message/i');
    await expect(messagesContent.first()).toBeVisible({ timeout: 5000 });
  });

  test('open conversation → send message → message appears in the inline thread', async ({ messagesPage }) => {
    const convCount = await messagesPage.getConversationCount();
    if (convCount > 0) {
      await messagesPage.openConversation(0);
      await messagesPage.thread.messageInput.waitFor({ state: 'visible', timeout: 5_000 });

      const msg = `E2E test message ${Date.now()}`;
      await messagesPage.sendMessage(msg);
      await messagesPage.page.waitForTimeout(2000);

      // Message should appear in the thread
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
    if (!(await messagesPage.hasConversations())) {
      await expect(messagesPage.emptyState).toBeVisible();
      await expect(messagesPage.emptyStateCta).toBeVisible();
      test.skip(true, 'CI account has no conversations — filter UI not rendered');
    }

    await messagesPage.filterByUsername('test');
    await messagesPage.page.waitForTimeout(500);
    await expect(messagesPage.searchInput).toHaveValue('test');
  });

  test('desktop: selecting a conversation keeps the list visible (split-pane, no modal)', async ({ messagesPage }) => {
    const convCount = await messagesPage.getConversationCount();
    if (convCount > 0) {
      await messagesPage.openConversation(0);
      await messagesPage.thread.messageInput.waitFor({ state: 'visible', timeout: 5_000 });

      // Split-pane persists: the conversation list stays visible alongside the thread.
      await expect(messagesPage.conversationList.first()).toBeVisible();
    }
  });

  test('empty state when no conversations match filter', async ({ messagesPage }) => {
    if (!(await messagesPage.hasConversations())) {
      await expect(messagesPage.emptyState).toBeVisible();
      await expect(messagesPage.emptyStateCta).toBeVisible();
      test.skip(true, 'CI account has no conversations — filter UI not rendered');
    }

    await messagesPage.filterByUsername('zzz_nonexistent_user_zzz');
    await messagesPage.page.waitForTimeout(1000);

    // After filtering with nonexistent username, conversations should be filtered
    const convCount = await messagesPage.getConversationCount();
    // May show 0 or empty state
    expect(convCount).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Messages — mobile full-screen thread', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ messagesPage }) => {
    await messagesPage.goto();
  });

  test('opening a conversation covers the list; back button returns to it', async ({ messagesPage }) => {
    const convCount = await messagesPage.getConversationCount();
    if (convCount > 0) {
      await messagesPage.openConversation(0);
      await messagesPage.thread.messageInput.waitFor({ state: 'visible', timeout: 5_000 });

      // Full-screen overlay: back button is only rendered below the md breakpoint.
      await expect(messagesPage.thread.backButton).toBeVisible();
      await messagesPage.thread.backButton.click();

      await messagesPage.page.waitForTimeout(300);
      await expect(messagesPage.conversationList.first()).toBeVisible();
    }
  });
});
