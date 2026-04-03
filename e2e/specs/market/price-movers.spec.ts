import { test, expect } from '../../fixtures/test';

// Skipped: depends on external MTGStocks API data that may not load in CI
test.describe.skip('Price Movers', () => {
  test.beforeEach(async ({ marketPage }) => {
    await marketPage.goto();
    await marketPage.switchTab('movers');
  });

  test('price movers tab loads winners list', async ({ marketPage }) => {
    await expect(marketPage.movers.table).toBeVisible({ timeout: 10_000 });
  });

  test('switch between Winners/Losers tabs', async ({ marketPage }) => {
    await marketPage.movers.winnersButton.click();
    await marketPage.page.waitForTimeout(500);
    await expect(marketPage.movers.table).toBeVisible();

    await marketPage.movers.losersButton.click();
    await marketPage.page.waitForTimeout(500);
    await expect(marketPage.movers.table).toBeVisible();
  });

  test('filter by format changes displayed movers', async ({ marketPage }) => {
    if (await marketPage.movers.formatSelect.isVisible()) {
      await marketPage.movers.formatSelect.selectOption({ index: 1 });
      await marketPage.page.waitForTimeout(1000);
      await expect(marketPage.movers.table).toBeVisible();
    }
  });

  test('filter by price type updates movers context', async ({ marketPage }) => {
    if (await marketPage.movers.priceTypeSelect.isVisible()) {
      await marketPage.movers.priceTypeSelect.selectOption({ index: 1 });
      await marketPage.page.waitForTimeout(1000);
      await expect(marketPage.movers.table).toBeVisible();
    }
  });

  test('search by card name using autocomplete', async ({ marketPage }) => {
    if (await marketPage.movers.searchInput.isVisible()) {
      await marketPage.movers.searchInput.fill('Lightning');
      await marketPage.page.waitForTimeout(1500);
    }
  });
});
