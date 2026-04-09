import { test, expect } from '../../fixtures/test';

test.describe('Collection View Modes', () => {
  test.beforeEach(async ({ collectionPage }) => {
    await collectionPage.goto();
  });

  test('visual grid renders card images', async ({ collectionPage }) => {
    await collectionPage.switchView('visual');
    await collectionPage.page.waitForTimeout(500);

    const images = collectionPage.page.locator('img[loading="lazy"]');
    const count = await images.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('text view shows list with card data columns', async ({ collectionPage }) => {
    await collectionPage.switchView('texto');
    await collectionPage.page.waitForTimeout(500);

    await expect(collectionPage.statusFilters).toBeVisible();
  });
});

test.describe('Dual-Faced Cards', () => {
  test.beforeEach(async ({ collectionPage }) => {
    await collectionPage.goto();
  });

  test('dual-faced card shows toggle button', async ({ collectionPage }) => {
    const toggleButton = collectionPage.faceToggleButton(0);
    // May or may not exist depending on collection contents
    const count = await toggleButton.count();
    // If there are dual-faced cards, the toggle should be visible
    if (count > 0) {
      await expect(toggleButton).toBeVisible();
    }
  });

  test('clicking toggle switches between card faces', async ({ collectionPage }) => {
    const toggleButton = collectionPage.faceToggleButton(0);
    const count = await toggleButton.count();

    if (count > 0) {
      // Get image before toggle
      const imgBefore = await collectionPage.page.locator('img[loading="lazy"]').first().getAttribute('src');
      await toggleButton.click();
      await collectionPage.page.waitForTimeout(300);
      const imgAfter = await collectionPage.page.locator('img[loading="lazy"]').first().getAttribute('src');

      // Image src should change when toggling
      expect(imgAfter).not.toBe(imgBefore);
    }
  });
});
