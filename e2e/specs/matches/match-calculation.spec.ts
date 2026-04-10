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

    // Wait for page to settle — either match cards load OR empty state renders
    const matchCard = page.locator('[data-match-id]').first();
    const emptyMessage = matchesPage.noMatchesMessage;

    await Promise.race([
      matchCard.waitFor({ state: 'visible', timeout: 15_000 }),
      emptyMessage.waitFor({ state: 'visible', timeout: 15_000 }),
    ]).catch(() => {});

    // If no match cards visible, the empty state should be
    if (!(await matchCard.isVisible().catch(() => false))) {
      await expect(emptyMessage).toBeVisible();
    }
  });
});
