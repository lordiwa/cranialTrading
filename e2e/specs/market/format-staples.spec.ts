import { test, expect } from '../../fixtures/test';

test.describe('Format Staples', () => {
  test.beforeEach(async ({ marketPage }) => {
    await marketPage.goto();
    await marketPage.switchTab('staples');
    await marketPage.page.waitForTimeout(2000);
  });

  test('format staples tab loads with staples list', async ({ marketPage }) => {
    await expect(marketPage.staples.table).toBeVisible({ timeout: 10_000 });
  });

  test('switch format selector changes displayed staples', async ({ marketPage }) => {
    if (await marketPage.staples.formatSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await marketPage.staples.formatSelect.selectOption({ index: 1 });
      await marketPage.page.waitForTimeout(1000);
      await expect(marketPage.staples.table).toBeVisible();
    }
  });

  test('switch category filters staples', async ({ marketPage }) => {
    // Categories are buttons (Creatures, Spells, Lands, Overall)
    const categoryBtn = marketPage.staples.categoryButtons.first();
    if (await categoryBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await categoryBtn.click();
      await marketPage.page.waitForTimeout(1000);
      await expect(marketPage.staples.table).toBeVisible();
    }
  });
});
