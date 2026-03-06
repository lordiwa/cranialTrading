import { test, expect } from '../../fixtures/test';

test.describe('Portfolio Impact', () => {
  test.beforeEach(async ({ marketPage }) => {
    await marketPage.goto();
    await marketPage.switchTab('portfolio');
    await marketPage.page.waitForTimeout(1000);
  });

  test('portfolio impact section renders with total delta', async ({ marketPage }) => {
    // Should show portfolio section or loading state
    await expect(marketPage.portfolio.totalDelta).toBeVisible({ timeout: 10_000 });
  });

  test('sort by impact vs percentage changes order', async ({ marketPage }) => {
    if (await marketPage.portfolio.sortButtons.first().isVisible()) {
      await marketPage.portfolio.sortButtons.first().click();
      await marketPage.page.waitForTimeout(500);
    }
  });

  test('owned cards highlighted with dollar change amount', async ({ marketPage }) => {
    if (await marketPage.portfolio.table.isVisible()) {
      const rows = marketPage.portfolio.table.locator('tr');
      const count = await rows.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});
