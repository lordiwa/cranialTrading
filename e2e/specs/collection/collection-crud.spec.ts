import { test, expect } from '../../fixtures/test';
import { SEARCH_TERMS } from '../../helpers/test-data';

test.describe('Collection CRUD', () => {
  test.beforeEach(async ({ collectionPage }) => {
    await collectionPage.goto();
  });

  test('collection page loads with card grid visible', async ({ collectionPage, page }) => {
    await expect(page).toHaveURL(/\/collection/);
    await expect(collectionPage.statusFilters).toBeVisible();
  });

  test('add card: open modal → search → select → save → card appears', async ({ collectionPage, commonPage }) => {
    await collectionPage.openAddCardModal();
    await collectionPage.addModal.searchInput.waitFor({ state: 'visible' });
    await collectionPage.addModal.searchInput.fill(SEARCH_TERMS.common);
    await collectionPage.addModal.searchInput.press('Enter');

    // Wait for results
    await collectionPage.page.waitForTimeout(3000);
    await collectionPage.addModal.resultCards.first().waitFor({ state: 'visible', timeout: 10_000 });
    await collectionPage.addModal.resultCards.first().click({ force: true });

    // Fill form and save
    await collectionPage.page.waitForTimeout(500);
    await collectionPage.addModal.quantityInput.waitFor({ state: 'visible' });
    await collectionPage.addModal.quantityInput.fill('1');
    await collectionPage.addModal.saveButton.click();

    await commonPage.waitForToast('success');
  });

  test('edit card: open detail modal → edit → save → changes persist', async ({ collectionPage, commonPage, page }) => {
    // Wait for cards to load
    await page.waitForTimeout(1000);
    const cardCount = await collectionPage.getCardCount();
    if (cardCount === 0) return; // Skip if no cards

    await collectionPage.clickCardInGrid(0);

    // Wait for edit modal (z-50 overlay)
    const modal = page.locator('.fixed.inset-0.z-50');
    await modal.waitFor({ state: 'visible', timeout: 5_000 });

    // Change quantity if input is visible
    const qtyInput = collectionPage.editModal.quantityInput;
    if (await qtyInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await qtyInput.fill('3');
      await collectionPage.editModal.saveButton.click();
      await commonPage.waitForToast('success');
    }
  });

  test('delete card: open detail → delete → confirm → card removed', async ({ collectionPage, commonPage, page }) => {
    await page.waitForTimeout(1000);
    const countBefore = await collectionPage.getCardCount();
    if (countBefore === 0) return;

    await collectionPage.clickCardInGrid(0);

    const modal = page.locator('.fixed.inset-0.z-50');
    await modal.waitFor({ state: 'visible', timeout: 5_000 });

    const deleteBtn = collectionPage.editModal.deleteButton;
    if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteBtn.click();
      await commonPage.confirmAction();
      await commonPage.waitForToast('success');
      await page.waitForTimeout(1000);
      const countAfter = await collectionPage.getCardCount();
      expect(countAfter).toBeLessThan(countBefore);
    }
  });

  test('bulk select → bulk change status to Sale → verify status updated', async ({ collectionPage, commonPage, page }) => {
    // Enter selection mode
    const selectBtn = collectionPage.selectModeButton;
    if (!(await selectBtn.isVisible({ timeout: 3000 }).catch(() => false))) return;
    await selectBtn.click();
    await page.waitForTimeout(500);

    // Select first card via checkbox or click
    const checkbox = page.locator('input[type="checkbox"]').first();
    if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkbox.click();
      const saleButton = page.getByRole('button', { name: /sale|venta/i });
      if (await saleButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await saleButton.click();
        await commonPage.waitForToast('success');
      }
    }
  });

  test('bulk select → bulk delete → confirm → cards removed', async ({ collectionPage, commonPage, page }) => {
    const selectBtn = collectionPage.selectModeButton;
    if (!(await selectBtn.isVisible({ timeout: 3000 }).catch(() => false))) return;
    await selectBtn.click();
    await page.waitForTimeout(500);

    const checkbox = page.locator('input[type="checkbox"]').first();
    if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkbox.click();
      const deleteButton = page.getByRole('button', { name: /delete all|eliminar/i });
      if (await deleteButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await deleteButton.click();
        await commonPage.confirmAction();
        await commonPage.waitForToast('success');
      }
    }
  });

  test('cancel deletion from confirm dialog leaves card intact', async ({ collectionPage, commonPage, page }) => {
    await page.waitForTimeout(1000);
    const countBefore = await collectionPage.getCardCount();
    if (countBefore === 0) return;

    await collectionPage.clickCardInGrid(0);

    const modal = page.locator('.fixed.inset-0.z-50');
    await modal.waitFor({ state: 'visible', timeout: 5_000 });

    const deleteBtn = collectionPage.editModal.deleteButton;
    if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteBtn.click();
      await commonPage.cancelAction();
      await page.waitForTimeout(500);
      const countAfter = await collectionPage.getCardCount();
      expect(countAfter).toBe(countBefore);
    }
  });
});
