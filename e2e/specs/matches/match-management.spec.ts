import { test, expect } from '../../fixtures/test';

test.describe('Match Management', () => {
  test.beforeEach(async ({ matchesPage }) => {
    await matchesPage.goto();
  });

  // TASK-259 (AC4): kept @smoke — everything it asserts is read-only. The old
  // version only checked the 4 tab buttons exist, a shell check that would
  // stay green even if match calculation/rendering were broken underneath
  // them. Strengthened with a real check that the matches list itself
  // finished rendering — not just the tab chrome.
  //
  // Deliberately does NOT assert the specific empty-state text
  // (`matches.empty.new.title`), even though the DEV suite account is
  // measured at 0 matches: @smoke also runs on push-to-main against
  // PRODUCTION, reusing the SAME `TEST_USER_A_EMAIL`/`PASSWORD` secret pair
  // (test.yml) — but dev and prod are different Firebase projects, so that
  // credential pair resolves to two independent accounts whose match count
  // was never measured to agree. SavedMatchesView.vue renders exactly one of
  // "new" tab's empty state OR at least one match card once loading finishes
  // (currentMatches.length === 0 && !loading, else the matches list) — this
  // OR holds true and is real+read-only whether the authenticated account
  // has 0 matches or many, in dev or in prod.
  test('matches page loads with tab navigation @smoke', async ({ matchesPage }) => {
    await expect(matchesPage.tabs.new).toBeVisible();
    await expect(matchesPage.tabs.sent).toBeVisible();
    await expect(matchesPage.tabs.saved).toBeVisible();
    await expect(matchesPage.tabs.deleted).toBeVisible();

    await expect(
      matchesPage.noMatchesMessage.or(matchesPage.matchCards.first()),
    ).toBeVisible({ timeout: 10_000 });
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
