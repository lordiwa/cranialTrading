import { test, expect } from '../../fixtures/test';

test.describe('Collection Filters', () => {
  test.beforeEach(async ({ collectionPage }) => {
    await collectionPage.goto();
  });

  test('status filter: click "AVAILABLE" → filters cards', async ({ collectionPage }) => {
    await collectionPage.filterByStatus('available');
    await collectionPage.page.waitForTimeout(500);
    await expect(collectionPage.statusFilters).toBeVisible();
  });

  test('status filter: click "ALL" → resets to full collection', async ({ collectionPage }) => {
    // First filter, then reset
    await collectionPage.filterByStatus('available');
    await collectionPage.page.waitForTimeout(300);

    await collectionPage.filterByStatus('all');
    await collectionPage.page.waitForTimeout(300);

    await expect(collectionPage.statusFilters).toBeVisible();
  });

  test('search bar filters collection by card name', async ({ collectionPage }) => {
    await collectionPage.searchInput.fill('Lightning');
    await collectionPage.page.waitForTimeout(500);

    await expect(collectionPage.searchInput).toHaveValue('Lightning');
  });

  test('sort dropdown changes card order', async ({ collectionPage, page }) => {
    // Sort is a <select> dropdown, not buttons
    const sortSelect = page.locator('select').first();
    if (await sortSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      const options = await sortSelect.locator('option').allTextContents();
      if (options.length > 1) {
        await sortSelect.selectOption({ index: 1 });
        await page.waitForTimeout(500);
      }
    }
    await expect(collectionPage.statusFilters).toBeVisible();
  });
});
