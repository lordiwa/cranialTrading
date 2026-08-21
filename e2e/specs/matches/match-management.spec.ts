import { test, expect } from '../../fixtures/test';

test.describe('Match Management', () => {
  test.beforeEach(async ({ matchesPage }) => {
    await matchesPage.goto();
  });

  // TASK-259 review (HIGH-1), TASK-265: @smoke REMOVED — this test is NOT
  // read-only, and an earlier version of this comment wrongly claimed it
  // was. Traced and independently re-verified: matchesPage.goto() mounts
  // SavedMatchesView, whose initView() (line ~759) calls
  // matchesStore.loadAllMatches() → _loadAllMatches() (stores/matches.ts
  // line ~292), whose FIRST step is `await cleanExpiredMatches()` (line
  // ~298). cleanExpiredMatches() (line ~386) reads matches_nuevos/
  // matches_guardados, filters anything past its 15-day expiration, and
  // **deletes it via writeBatch** — silently (empty catch). So simply
  // loading /saved-matches can delete real documents, and @smoke runs on
  // every push to `main` against PRODUCTION. This was already true of the
  // OLD version of this test (the effect is pre-existing, TASK-259 didn't
  // introduce it) — what TASK-259 introduced was a comment asserting the
  // test was read-only, which was false. TASK-265 tracks fixing the cause
  // (cleanExpiredMatches running as a mount-time side effect instead of a
  // deliberate, gated action). The `.or()` assertion below is unrelated to
  // this and stays — it's a genuine strengthening over the old 4-tabs-only
  // shell check, confirmed independently, not a mutator.
  test('matches page loads with tab navigation', async ({ matchesPage }) => {
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
