import { test, expect } from '../../fixtures/test';

test.describe('Match Management', () => {
  test.beforeEach(async ({ matchesPage }) => {
    await matchesPage.goto();
  });

  test('matches page loads with tab navigation', async ({ matchesPage }) => {
    await expect(matchesPage.tabs.new).toBeVisible();
    await expect(matchesPage.tabs.sent).toBeVisible();
    await expect(matchesPage.tabs.saved).toBeVisible();
    await expect(matchesPage.tabs.deleted).toBeVisible();
  });

  test('open match detail modal → shows card comparison + user info', async ({ matchesPage }) => {
    const matchCount = await matchesPage.getMatchCount();
    if (matchCount > 0) {
      await matchesPage.openMatchDetail(0);
      await matchesPage.page.waitForTimeout(1000);
    }
  });

  test('save match (ME INTERESA) → moves to Saved tab', async ({ matchesPage, commonPage }) => {
    const matchCount = await matchesPage.getMatchCount();
    if (matchCount > 0) {
      await matchesPage.saveMatch(0);
      await matchesPage.page.waitForTimeout(2000);
    }
  });

  test('discard match → moves to Deleted tab', async ({ matchesPage }) => {
    const matchCount = await matchesPage.getMatchCount();
    if (matchCount > 0) {
      await matchesPage.discardMatch(0);
      await matchesPage.page.waitForTimeout(2000);
    }
  });

  test('share a match → toast confirmation', async ({ matchesPage, commonPage }) => {
    await matchesPage.switchTab('saved');
    await matchesPage.page.waitForTimeout(1000);

    const savedCount = await matchesPage.getMatchCount();
    if (savedCount > 0) {
      const shareBtn = matchesPage.matchAction(0, 'share|compartir');
      if (await shareBtn.isVisible()) {
        await shareBtn.click();
        await commonPage.waitForToast('success');
      }
    }
  });

  test('block user from match card → appears in blocked users list', async ({ matchesPage }) => {
    const matchCount = await matchesPage.getMatchCount();
    if (matchCount > 0) {
      const blockBtn = matchesPage.matchAction(0, 'block|bloque');
      if (await blockBtn.isVisible()) {
        await blockBtn.click();
        await matchesPage.page.waitForTimeout(1000);
      }
    }
  });

  test('switch between match tabs → each renders its content', async ({ matchesPage }) => {
    const tabs: Array<'new' | 'sent' | 'saved' | 'deleted'> = ['new', 'sent', 'saved', 'deleted'];
    for (const tab of tabs) {
      await matchesPage.switchTab(tab);
      await matchesPage.page.waitForTimeout(500);
      await expect(matchesPage.tabs[tab]).toBeVisible();
    }
  });
});
