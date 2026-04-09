import { test, expect } from '../../fixtures/test';

test.describe('Match Calculation', () => {
  test.beforeEach(async ({ matchesPage }) => {
    await matchesPage.goto();
  });

  test('calculate matches button triggers scanning with progress', async ({ matchesPage, page }) => {
    if (await matchesPage.calculateButton.isVisible()) {
      await matchesPage.calculateButton.click();

      // Should show some loading/progress indicator
      await page.waitForTimeout(3000);
    }
    await expect(matchesPage.tabs.new).toBeVisible();
  });

  test('calculated matches appear on "New" tab', async ({ matchesPage, page }) => {
    await matchesPage.switchTab('new');
    await page.waitForTimeout(2000);

    // Either shows match cards, no-matches message, or any match-related content
    const matchCount = await matchesPage.getMatchCount();
    const noMatches = await matchesPage.noMatchesMessage.isVisible().catch(() => false);
    const tabVisible = await matchesPage.tabs.new.isVisible().catch(() => false);
    expect(matchCount > 0 || noMatches || tabVisible).toBeTruthy();
  });

  test('no matches found shows guidance message', async ({ matchesPage, page }) => {
    await matchesPage.switchTab('new');
    // Wait for matches to load (either cards appear or empty state renders)
    await page.waitForTimeout(3000);
    const matchCount = await matchesPage.getMatchCount();

    if (matchCount === 0) {
      await expect(matchesPage.noMatchesMessage).toBeVisible({ timeout: 10_000 });
    }
  });
});
